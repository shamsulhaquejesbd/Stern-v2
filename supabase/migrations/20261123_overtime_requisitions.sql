-- ============================================================================
-- Migration: Overtime Requisition Module & Head Office Approval Workflow
-- Date: 2026-11-23
-- Description:
--   1. Creates public.overtime_requisitions (Factory capacity requisition form,
--      Head Office approval workflow, Overtime Granted status).
--   2. Creates public.overtime_requisition_purposes (multi-select Payroll
--      Settings purposes + editable manual purposes without altering Settings).
--   3. Creates public.overtime_requisition_approval_history (immutable audit trail
--      of SUBMITTED / RESUBMITTED / APPROVED / REJECTED / RETURNED_FOR_CORRECTION).
--   4. Adds optional nullable requisition_id & requisition_number link columns to
--      public.overtime_requests so existing Overtime Requests can link to an
--      Approved (Overtime Granted) requisition without auto-generating attendance
--      or payroll payments.
--   5. Adds DB-level status transition validation, permission enforcement on
--      Head Office approvals, and RLS policies.
-- ============================================================================

BEGIN;

-- 1. Main Overtime Requisitions Table
CREATE TABLE IF NOT EXISTS public.overtime_requisitions (
  id TEXT PRIMARY KEY,
  requisition_number TEXT UNIQUE NOT NULL,
  requisition_date DATE NOT NULL DEFAULT CURRENT_DATE,
  overtime_date DATE NOT NULL,
  required_workers INTEGER NOT NULL CHECK (required_workers > 0),
  requested_hours NUMERIC(5, 2) NOT NULL CHECK (requested_hours > 0 AND requested_hours <= 24),
  purpose TEXT NOT NULL DEFAULT '',
  purposes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  remarks TEXT,
  requested_by_id TEXT NOT NULL,
  requested_by_name TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_by_role TEXT,
  requested_by_department TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'Pending Approval'
    CHECK (status IN ('Pending Approval', 'Approved', 'Rejected', 'Returned for Correction')),
  overtime_granted BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at TIMESTAMPTZ,
  approved_by_id TEXT,
  approved_by_name TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  approval_remarks TEXT,
  returned_count INTEGER NOT NULL DEFAULT 0,
  last_resubmitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Normalized Multi-Purpose Table (Payroll Settings + Manual Custom Purposes)
CREATE TABLE IF NOT EXISTS public.overtime_requisition_purposes (
  id TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL REFERENCES public.overtime_requisitions(id) ON DELETE CASCADE,
  payroll_purpose_id TEXT,
  purpose_name TEXT NOT NULL CHECK (length(btrim(purpose_name)) > 0),
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Immutable Approval & Submission History Table
CREATE TABLE IF NOT EXISTS public.overtime_requisition_approval_history (
  id TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL REFERENCES public.overtime_requisitions(id) ON DELETE CASCADE,
  action TEXT NOT NULL
    CHECK (action IN ('SUBMITTED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED_FOR_CORRECTION', 'UPDATED')),
  actor_id TEXT,
  actor_name TEXT NOT NULL,
  actor_role TEXT,
  remarks TEXT,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  action_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Optional link on existing overtime_requests (no auto-creation of attendance/payroll)
ALTER TABLE public.overtime_requests
  ADD COLUMN IF NOT EXISTS requisition_id TEXT REFERENCES public.overtime_requisitions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requisition_number TEXT;

-- 5. Indexes for fast filtering & reporting
CREATE INDEX IF NOT EXISTS idx_ot_requisitions_status
  ON public.overtime_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_ot_requisitions_overtime_date
  ON public.overtime_requisitions(overtime_date DESC);
CREATE INDEX IF NOT EXISTS idx_ot_requisitions_req_date
  ON public.overtime_requisitions(requisition_date DESC);
CREATE INDEX IF NOT EXISTS idx_ot_requisitions_requested_by_id
  ON public.overtime_requisitions(requested_by_id);
CREATE INDEX IF NOT EXISTS idx_ot_requisitions_granted
  ON public.overtime_requisitions(overtime_granted)
  WHERE overtime_granted = TRUE;
CREATE INDEX IF NOT EXISTS idx_ot_req_purposes_requisition_id
  ON public.overtime_requisition_purposes(requisition_id);
CREATE INDEX IF NOT EXISTS idx_ot_req_history_requisition_id
  ON public.overtime_requisition_approval_history(requisition_id, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_requisition_id
  ON public.overtime_requests(requisition_id);

-- 6. DB-Level Helper: Check if a user ID is authorized for Overtime Requisition Approval
CREATE OR REPLACE FUNCTION public.fn_user_can_approve_ot_requisition(p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_perms JSONB;
  v_ot_perms JSONB;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RETURN FALSE;
  END IF;

  SELECT id, uid, user_id, role, status, permissions
  INTO v_user
  FROM public.users
  WHERE uid = p_user_id
     OR user_id = p_user_id
     OR ('u-sb-' || id::TEXT) = p_user_id
     OR lower(email) = lower(p_user_id)
  LIMIT 1;

  IF NOT FOUND THEN
    -- Allow if user record lives outside users table (e.g., service/system fallback)
    RETURN FALSE;
  END IF;

  IF COALESCE(v_user.status, 'Active') IN ('Blocked', 'Inactive') THEN
    RETURN FALSE;
  END IF;

  IF v_user.role = 'Super Admin' THEN
    RETURN TRUE;
  END IF;

  IF jsonb_typeof(v_user.permissions::jsonb) = 'object' THEN
    v_perms := v_user.permissions::jsonb;
    v_ot_perms := v_perms #> '{pagePermissions,overtime-management}';
    IF jsonb_typeof(v_ot_perms) = 'object' THEN
      RETURN COALESCE((v_ot_perms->>'view')::BOOLEAN, FALSE)
         AND COALESCE((v_ot_perms->>'approve_requisition')::BOOLEAN, FALSE);
    END IF;
  END IF;

  RETURN FALSE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- 7. DB-Level Trigger: Enforce Requisition Workflow Integrity & Permission Gate
CREATE OR REPLACE FUNCTION public.fn_guard_overtime_requisition_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approver_exists BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'Pending Approval' THEN
      RAISE EXCEPTION 'New overtime requisitions must start in Pending Approval status.';
    END IF;
    NEW.overtime_granted := FALSE;
    NEW.granted_at := NULL;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  -- Block silent modification of already Approved or Rejected requisitions
  IF OLD.status IN ('Approved', 'Rejected') THEN
    RAISE EXCEPTION 'Requisition % is already % and cannot be modified.', OLD.requisition_number, OLD.status;
  END IF;

  -- Returned for Correction -> Resubmission back to Pending Approval
  IF OLD.status = 'Returned for Correction' THEN
    IF NEW.status <> 'Pending Approval' THEN
      RAISE EXCEPTION 'Returned requisitions may only transition back to Pending Approval upon resubmission.';
    END IF;
    NEW.overtime_granted := FALSE;
    NEW.granted_at := NULL;
    NEW.last_resubmitted_at := COALESCE(NEW.last_resubmitted_at, NOW());
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- Pending Approval -> Decision (Approved / Rejected / Returned for Correction)
  IF OLD.status = 'Pending Approval' AND NEW.status IN ('Approved', 'Rejected', 'Returned for Correction') THEN
    IF COALESCE(btrim(NEW.approved_by_id), '') = '' OR COALESCE(btrim(NEW.approved_by_name), '') = '' THEN
      RAISE EXCEPTION 'Approver identity (approved_by_id and approved_by_name) is required for requisition decisions.';
    END IF;

    -- Verify against public.users when the approver record exists in DB
    SELECT EXISTS (
      SELECT 1
      FROM public.users
      WHERE uid = NEW.approved_by_id
         OR user_id = NEW.approved_by_id
         OR ('u-sb-' || id::TEXT) = NEW.approved_by_id
         OR lower(email) = lower(NEW.approved_by_id)
    ) INTO v_approver_exists;

    IF v_approver_exists AND NOT public.fn_user_can_approve_ot_requisition(NEW.approved_by_id) THEN
      RAISE EXCEPTION 'Permission denied: User % lacks Overtime Requisition Approval clearance.', NEW.approved_by_name;
    END IF;

    IF NEW.status = 'Approved' THEN
      NEW.overtime_granted := TRUE;
      NEW.granted_at := COALESCE(NEW.granted_at, NOW());
    ELSE
      NEW.overtime_granted := FALSE;
      NEW.granted_at := NULL;
      IF NEW.status = 'Returned for Correction' THEN
        NEW.returned_count := COALESCE(OLD.returned_count, 0) + 1;
      END IF;
    END IF;
    NEW.approved_at := COALESCE(NEW.approved_at, NOW());
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid requisition status transition from % to %.', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_overtime_requisition_workflow ON public.overtime_requisitions;
CREATE TRIGGER trg_guard_overtime_requisition_workflow
  BEFORE INSERT OR UPDATE ON public.overtime_requisitions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_overtime_requisition_workflow();

-- 8. DB-Level Trigger: Ensure overtime_requests only links to Approved (Overtime Granted) requisitions
CREATE OR REPLACE FUNCTION public.fn_validate_overtime_request_requisition_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
BEGIN
  IF NEW.requisition_id IS NULL OR btrim(NEW.requisition_id) = '' THEN
    NEW.requisition_id := NULL;
    RETURN NEW;
  END IF;

  SELECT id, requisition_number, status, overtime_granted
  INTO v_req
  FROM public.overtime_requisitions
  WHERE id = NEW.requisition_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced Overtime Requisition (%) does not exist.', NEW.requisition_id;
  END IF;

  IF v_req.status <> 'Approved' OR COALESCE(v_req.overtime_granted, FALSE) = FALSE THEN
    RAISE EXCEPTION 'Only Approved (Overtime Granted) requisitions can be linked to Overtime Requests. Current status: %.', v_req.status;
  END IF;

  NEW.requisition_number := v_req.requisition_number;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_overtime_request_requisition_link ON public.overtime_requests;
CREATE TRIGGER trg_validate_overtime_request_requisition_link
  BEFORE INSERT OR UPDATE ON public.overtime_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_overtime_request_requisition_link();

-- 9. Row-Level Security & Grants
ALTER TABLE public.overtime_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_requisition_purposes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_requisition_approval_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all overtime_requisitions" ON public.overtime_requisitions;
CREATE POLICY "Allow public all overtime_requisitions"
  ON public.overtime_requisitions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all overtime_requisition_purposes" ON public.overtime_requisition_purposes;
CREATE POLICY "Allow public all overtime_requisition_purposes"
  ON public.overtime_requisition_purposes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read insert overtime_requisition_approval_history" ON public.overtime_requisition_approval_history;
CREATE POLICY "Allow public read insert overtime_requisition_approval_history"
  ON public.overtime_requisition_approval_history FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.overtime_requisitions TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.overtime_requisition_purposes TO postgres, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.overtime_requisition_approval_history TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.overtime_requisition_approval_history TO postgres, service_role;
REVOKE UPDATE, DELETE ON public.overtime_requisition_approval_history FROM anon;

COMMIT;

NOTIFY pgrst, 'reload schema';
