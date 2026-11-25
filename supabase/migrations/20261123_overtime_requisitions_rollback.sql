-- ============================================================================
-- Rollback: Overtime Requisition Module & Head Office Approval Workflow
-- Date: 2026-11-23
-- ============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_validate_overtime_request_requisition_link ON public.overtime_requests;
DROP FUNCTION IF EXISTS public.fn_validate_overtime_request_requisition_link();

DROP TRIGGER IF EXISTS trg_guard_overtime_requisition_workflow ON public.overtime_requisitions;
DROP FUNCTION IF EXISTS public.fn_guard_overtime_requisition_workflow();
DROP FUNCTION IF EXISTS public.fn_user_can_approve_ot_requisition(TEXT);

DROP INDEX IF EXISTS idx_overtime_requests_requisition_id;
ALTER TABLE public.overtime_requests
  DROP COLUMN IF EXISTS requisition_number,
  DROP COLUMN IF EXISTS requisition_id;

DROP TABLE IF EXISTS public.overtime_requisition_approval_history;
DROP TABLE IF EXISTS public.overtime_requisition_purposes;
DROP TABLE IF EXISTS public.overtime_requisitions;

COMMIT;
