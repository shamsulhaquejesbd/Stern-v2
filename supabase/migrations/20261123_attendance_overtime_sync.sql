-- ============================================================================
-- Migration: Automatic Attendance <-> Overtime Requisition Synchronization
-- Date: 2026-11-23
-- Description:
--   1. Adds cancellation tracking columns on public.overtime_requests.
--   2. Ensures unique index uq_overtime_requests_employee_date exists.
--   3. Creates DB-level parser & AFTER INSERT OR UPDATE trigger on
--      public.employee_attendances to automatically create, update, or cancel
--      Pending Overtime Requisitions while strictly protecting Approved,
--      Rejected, and Cancelled requisitions and writing to overtime_audit_logs.
-- ============================================================================

BEGIN;

-- 1. Ensure required columns on public.overtime_requests exist
ALTER TABLE public.overtime_requests
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS purpose_id TEXT,
  ADD COLUMN IF NOT EXISTS purpose_selected_by TEXT,
  ADD COLUMN IF NOT EXISTS purpose_selected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_overtime_requests_employee_date
  ON public.overtime_requests (employee_id, overtime_date)
  WHERE status <> 'Cancelled';

-- 2. Helper function: Parse 'HH:mm' or '05:00 PM' into minutes since midnight
CREATE OR REPLACE FUNCTION public.fn_parse_time_to_minutes(raw_time TEXT)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned TEXT;
  m TEXT[];
  hr INT;
  mn INT;
  meridiem TEXT;
BEGIN
  IF raw_time IS NULL OR btrim(raw_time) = '' THEN
    RETURN NULL;
  END IF;

  cleaned := upper(regexp_replace(btrim(raw_time), '\.', '', 'g'));
  -- Match 12-hour format e.g. '5:00 PM' or '08:30AM'
  m := regexp_match(cleaned, '^\s*(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*\d{2})?\s*([AP]\s*M)\s*$');
  IF m IS NOT NULL THEN
    hr := m[1]::INT;
    mn := m[2]::INT;
    meridiem := regexp_replace(m[3], '\s+', '', 'g');
    IF hr < 1 OR hr > 12 OR mn < 0 OR mn > 59 THEN
      RETURN NULL;
    END IF;
    IF meridiem = 'AM' THEN
      IF hr = 12 THEN hr := 0; END IF;
    ELSE
      IF hr <> 12 THEN hr := hr + 12; END IF;
    END IF;
    RETURN hr * 60 + mn;
  END IF;

  -- Match 24-hour format e.g. '17:00' or '08:30:00'
  m := regexp_match(cleaned, '^\s*(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*\d{2})?\s*$');
  IF m IS NOT NULL THEN
    hr := m[1]::INT;
    mn := m[2]::INT;
    IF hr < 0 OR hr > 23 OR mn < 0 OR mn > 59 THEN
      RETURN NULL;
    END IF;
    RETURN hr * 60 + mn;
  END IF;

  RETURN NULL;
END;
$$;

-- 3. Trigger function: Synchronize Attendance IN/OUT updates -> overtime_requests
CREATE OR REPLACE FUNCTION public.fn_sync_attendance_to_overtime_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift_start_text TEXT;
  v_shift_end_text TEXT;
  v_shift_start_mins INT;
  v_shift_end_mins INT;
  v_in_mins INT;
  v_out_mins INT;
  v_effective_shift_end INT;
  v_ot_start_mins INT;
  v_ot_minutes INT := 0;
  v_ot_hours NUMERIC(5, 2) := 0;
  v_ot_start_hhmm TEXT;
  v_ot_end_hhmm TEXT;
  v_status_lower TEXT;
  v_active_req public.overtime_requests%ROWTYPE;
  v_cancelled_req public.overtime_requests%ROWTYPE;
  v_has_active BOOLEAN := FALSE;
  v_has_cancelled BOOLEAN := FALSE;
  v_basic NUMERIC(14, 2) := 25000;
  v_is_eligible BOOLEAN := TRUE;
  v_calc_basis TEXT := 'Basic Salary';
  v_std_hours NUMERIC(6, 2) := 208;
  v_multiplier NUMERIC(4, 2) := 2.0;
  v_fixed_rate NUMERIC(10, 2) := 0;
  v_policy_status TEXT := 'Active';
  v_hourly_rate NUMERIC(10, 2) := 0;
  v_total_amt NUMERIC(14, 2) := 0;
  v_year INT;
  v_next_seq INT;
  v_req_num TEXT;
  v_req_id TEXT;
  v_source_type TEXT;
  v_cancel_reason TEXT;
  v_audit_id TEXT;
BEGIN
  IF NEW.employee_id IS NULL OR NEW.date IS NULL THEN
    RETURN NEW;
  END IF;

  -- Avoid redundant trigger work if key time/status columns did not change on UPDATE
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.in_time, '') = COALESCE(NEW.in_time, '')
       AND COALESCE(OLD.out_time, '') = COALESCE(NEW.out_time, '')
       AND COALESCE(OLD.status, '') = COALESCE(NEW.status, '')
       AND OLD.date = NEW.date THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Load Default Shift Start/End dynamically from payroll_settings
  SELECT
    COALESCE(NULLIF(btrim(shift_start_time), ''), '09:00'),
    COALESCE(NULLIF(btrim(shift_end_time), ''), '18:00')
  INTO v_shift_start_text, v_shift_end_text
  FROM public.payroll_settings
  WHERE id = 'default'
  LIMIT 1;

  v_shift_start_mins := COALESCE(public.fn_parse_time_to_minutes(v_shift_start_text), 540);
  v_shift_end_mins := COALESCE(public.fn_parse_time_to_minutes(v_shift_end_text), 1080);

  v_status_lower := lower(btrim(COALESCE(NEW.status, '')));
  v_in_mins := public.fn_parse_time_to_minutes(NEW.in_time);
  v_out_mins := public.fn_parse_time_to_minutes(NEW.out_time);

  IF v_status_lower IN ('absent', 'leave', 'paid leave', 'unpaid leave') OR v_out_mins IS NULL THEN
    v_ot_minutes := 0;
    v_ot_hours := 0;
    v_ot_start_hhmm := lpad((v_shift_end_mins / 60)::TEXT, 2, '0') || ':' || lpad((v_shift_end_mins % 60)::TEXT, 2, '0');
    v_ot_end_hhmm := '';
  ELSE
    v_ot_end_hhmm := lpad((v_out_mins / 60)::TEXT, 2, '0') || ':' || lpad((v_out_mins % 60)::TEXT, 2, '0');
    v_effective_shift_end := v_shift_end_mins;

    IF v_shift_end_mins < v_shift_start_mins THEN
      v_effective_shift_end := v_shift_end_mins + 1440;
      IF v_in_mins IS NOT NULL AND v_in_mins < v_shift_start_mins THEN
        v_in_mins := v_in_mins + 1440;
      END IF;
      IF v_out_mins < v_shift_start_mins THEN
        v_out_mins := v_out_mins + 1440;
      END IF;
      IF v_in_mins IS NOT NULL AND v_out_mins < v_in_mins THEN
        v_out_mins := v_out_mins + 1440;
      END IF;
    ELSIF v_in_mins IS NOT NULL AND v_out_mins < v_in_mins THEN
      v_out_mins := v_out_mins + 1440;
    END IF;

    IF v_in_mins IS NOT NULL AND v_in_mins > v_effective_shift_end THEN
      v_ot_start_mins := v_in_mins;
    ELSE
      v_ot_start_mins := v_effective_shift_end;
    END IF;

    v_ot_minutes := GREATEST(0, v_out_mins - v_ot_start_mins);
    v_ot_hours := round((v_ot_minutes::NUMERIC / 60.0), 2);
    v_ot_start_hhmm := lpad(((v_ot_start_mins % 1440) / 60)::TEXT, 2, '0') || ':' || lpad((v_ot_start_mins % 60)::TEXT, 2, '0');
  END IF;

  -- Check existing active requisition by (employee_id, overtime_date)
  SELECT *
  INTO v_active_req
  FROM public.overtime_requests
  WHERE employee_id = NEW.employee_id
    AND overtime_date = NEW.date
    AND status <> 'Cancelled'
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;
  v_has_active := FOUND;

  IF v_has_active THEN
    -- Protect Approved requisitions
    IF v_active_req.status IN ('Supervisor Approved', 'Production Approved', 'HR Verified', 'Final Approved') THEN
      v_audit_id := 'ota-trg-' || extract(epoch FROM clock_timestamp())::BIGINT::TEXT || '-' || substr(md5(random()::TEXT), 1, 5);
      INSERT INTO public.overtime_audit_logs (
        id, record_id, record_type, action, actor_name, actor_role, details, previous_state, new_state
      ) VALUES (
        v_audit_id,
        v_active_req.id,
        'REQUEST',
        'ATTENDANCE_SYNC_LOCKED_APPROVED',
        'PostgreSQL Attendance Sync',
        'System',
        format('Attendance updated on %s (IN: %s, OUT: %s, Calculated OT: %sh), but %s remains %s (%sh).',
          NEW.date, COALESCE(NEW.in_time, '—'), COALESCE(NEW.out_time, '—'), v_ot_hours,
          v_active_req.request_number, v_active_req.status, v_active_req.expected_hours),
        v_active_req.status,
        v_active_req.status
      );
      RETURN NEW;
    END IF;

    -- Protect Rejected requisitions
    IF v_active_req.status = 'Rejected' THEN
      v_audit_id := 'ota-trg-' || extract(epoch FROM clock_timestamp())::BIGINT::TEXT || '-' || substr(md5(random()::TEXT), 1, 5);
      INSERT INTO public.overtime_audit_logs (
        id, record_id, record_type, action, actor_name, actor_role, details, previous_state, new_state
      ) VALUES (
        v_audit_id,
        v_active_req.id,
        'REQUEST',
        'ATTENDANCE_SYNC_LOCKED_REJECTED',
        'PostgreSQL Attendance Sync',
        'System',
        format('Attendance updated on %s (IN: %s, OUT: %s, Calculated OT: %sh), but %s remains Rejected.',
          NEW.date, COALESCE(NEW.in_time, '—'), COALESCE(NEW.out_time, '—'), v_ot_hours, v_active_req.request_number),
        'Rejected',
        'Rejected'
      );
      RETURN NEW;
    END IF;

    -- Pending requisition: Cancel if OT removed or < 60 mins; Update otherwise
    IF v_active_req.status IN ('Pending Supervisor', 'Draft', 'Pending') THEN
      IF v_ot_minutes < 60 THEN
        v_cancel_reason := CASE
          WHEN v_ot_minutes <= 0 THEN 'Attendance OUT Time Updated – No Overtime'
          ELSE format('Attendance OUT Time Updated – No Overtime (%s mins under 60-min minimum)', v_ot_minutes)
        END;

        UPDATE public.overtime_requests
        SET
          status = 'Cancelled',
          attendance_id = NEW.id,
          actual_overtime_hours = 0,
          cancellation_reason = v_cancel_reason,
          cancelled_by = 'Attendance Synchronization',
          cancelled_at = NOW(),
          rejection_reason = v_cancel_reason,
          updated_at = NOW()
        WHERE id = v_active_req.id;

        v_audit_id := 'ota-trg-' || extract(epoch FROM clock_timestamp())::BIGINT::TEXT || '-' || substr(md5(random()::TEXT), 1, 5);
        INSERT INTO public.overtime_audit_logs (
          id, record_id, record_type, action, actor_name, actor_role, details, previous_state, new_state
        ) VALUES (
          v_audit_id,
          v_active_req.id,
          'REQUEST',
          'ATTENDANCE_AUTO_CANCELLED',
          'PostgreSQL Attendance Sync',
          'System',
          format('Cancelled %s on %s after Attendance update (OUT: %s). Reason: %s',
            v_active_req.request_number, NEW.date, COALESCE(NEW.out_time, '—'), v_cancel_reason),
          v_active_req.status,
          'Cancelled'
        );
        RETURN NEW;
      END IF;

      -- Recalculate hourly rate & amount for updated Pending hours
      SELECT COALESCE(basic_salary_bdt, v_basic)
      INTO v_basic
      FROM public.employee_salary_structures
      WHERE employee_id = NEW.employee_id
      LIMIT 1;

      SELECT
        COALESCE(is_overtime_eligible, TRUE),
        COALESCE(overtime_calculation_basis, 'Basic Salary'),
        COALESCE(overtime_standard_hours, 208),
        COALESCE(overtime_multiplier, 2.0),
        COALESCE(overtime_fixed_rate, 0),
        COALESCE(overtime_policy_status, 'Active')
      INTO v_is_eligible, v_calc_basis, v_std_hours, v_multiplier, v_fixed_rate, v_policy_status
      FROM public.field_force_reps
      WHERE id = NEW.employee_id
      LIMIT 1;

      IF NOT v_is_eligible OR v_policy_status <> 'Active' THEN
        v_hourly_rate := 0;
        v_total_amt := 0;
      ELSIF v_calc_basis = 'Fixed Hourly Rate' THEN
        v_hourly_rate := v_fixed_rate;
        v_total_amt := round(v_hourly_rate * v_ot_hours, 2);
      ELSE
        v_hourly_rate := CASE WHEN COALESCE(v_std_hours, 208) > 0 THEN round(v_basic / v_std_hours, 2) ELSE 0 END;
        v_total_amt := round(v_hourly_rate * v_multiplier * v_ot_hours, 2);
      END IF;

      UPDATE public.overtime_requests
      SET
        expected_start_time = v_ot_start_hhmm,
        expected_end_time = v_ot_end_hhmm,
        expected_hours = v_ot_hours,
        actual_overtime_hours = v_ot_hours,
        attendance_id = NEW.id,
        basic_salary_bdt = v_basic,
        hourly_rate_bdt = v_hourly_rate,
        overtime_multiplier = v_multiplier,
        calculated_overtime_amount_bdt = v_total_amt,
        overtime_reason = CASE
          WHEN source_type IN ('QR_ATTENDANCE_AUTO', 'ATTENDANCE_AUTO')
            THEN format('Auto-updated from Attendance (IN: %s, Shift End: %s, OUT: %s)', COALESCE(NEW.in_time, '—'), v_ot_start_hhmm, v_ot_end_hhmm)
          ELSE overtime_reason
        END,
        updated_at = NOW()
      WHERE id = v_active_req.id;

      v_audit_id := 'ota-trg-' || extract(epoch FROM clock_timestamp())::BIGINT::TEXT || '-' || substr(md5(random()::TEXT), 1, 5);
      INSERT INTO public.overtime_audit_logs (
        id, record_id, record_type, action, actor_name, actor_role, details, previous_state, new_state
      ) VALUES (
        v_audit_id,
        v_active_req.id,
        'REQUEST',
        'ATTENDANCE_AUTO_UPDATED',
        'PostgreSQL Attendance Sync',
        'System',
        format('Updated %s on %s from %sh to %sh (OUT: %s).',
          v_active_req.request_number, NEW.date, v_active_req.expected_hours, v_ot_hours, v_ot_end_hhmm),
        v_active_req.status,
        v_active_req.status
      );
      RETURN NEW;
    END IF;

    RETURN NEW;
  END IF;

  -- Check Cancelled requisition protection (do not auto-reactivate Cancelled requisitions)
  SELECT *
  INTO v_cancelled_req
  FROM public.overtime_requests
  WHERE employee_id = NEW.employee_id
    AND overtime_date = NEW.date
    AND status = 'Cancelled'
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;
  v_has_cancelled := FOUND;

  IF v_has_cancelled THEN
    v_audit_id := 'ota-trg-' || extract(epoch FROM clock_timestamp())::BIGINT::TEXT || '-' || substr(md5(random()::TEXT), 1, 5);
    INSERT INTO public.overtime_audit_logs (
      id, record_id, record_type, action, actor_name, actor_role, details, previous_state, new_state
    ) VALUES (
      v_audit_id,
      v_cancelled_req.id,
      'REQUEST',
      'ATTENDANCE_SYNC_LOCKED_CANCELLED',
      'PostgreSQL Attendance Sync',
      'System',
      format('Attendance updated on %s (IN: %s, OUT: %s, Calculated OT: %sh), while %s remains Cancelled.',
        NEW.date, COALESCE(NEW.in_time, '—'), COALESCE(NEW.out_time, '—'), v_ot_hours, v_cancelled_req.request_number),
      'Cancelled',
      'Cancelled'
    );
    RETURN NEW;
  END IF;

  -- Below 60-minute threshold and no existing requisition -> do not create
  IF v_ot_minutes < 60 THEN
    RETURN NEW;
  END IF;

  -- Scenario A: Auto-generate new Pending Supervisor requisition for NEW.date
  SELECT COALESCE(basic_salary_bdt, v_basic)
  INTO v_basic
  FROM public.employee_salary_structures
  WHERE employee_id = NEW.employee_id
  LIMIT 1;

  SELECT
    COALESCE(is_overtime_eligible, TRUE),
    COALESCE(overtime_calculation_basis, 'Basic Salary'),
    COALESCE(overtime_standard_hours, 208),
    COALESCE(overtime_multiplier, 2.0),
    COALESCE(overtime_fixed_rate, 0),
    COALESCE(overtime_policy_status, 'Active')
  INTO v_is_eligible, v_calc_basis, v_std_hours, v_multiplier, v_fixed_rate, v_policy_status
  FROM public.field_force_reps
  WHERE id = NEW.employee_id
  LIMIT 1;

  IF NOT v_is_eligible OR v_policy_status <> 'Active' THEN
    v_hourly_rate := 0;
    v_total_amt := 0;
  ELSIF v_calc_basis = 'Fixed Hourly Rate' THEN
    v_hourly_rate := v_fixed_rate;
    v_total_amt := round(v_hourly_rate * v_ot_hours, 2);
  ELSE
    v_hourly_rate := CASE WHEN COALESCE(v_std_hours, 208) > 0 THEN round(v_basic / v_std_hours, 2) ELSE 0 END;
    v_total_amt := round(v_hourly_rate * v_multiplier * v_ot_hours, 2);
  END IF;

  v_year := extract(year FROM NEW.date)::INT;
  SELECT COALESCE(MAX((regexp_match(request_number, '(\d+)$'))[1]::INT), 0) + 1
  INTO v_next_seq
  FROM public.overtime_requests;

  v_req_num := format('OTR-%s-%s', v_year, lpad(v_next_seq::TEXT, 3, '0'));
  v_source_type := CASE
    WHEN COALESCE(NEW.gps_validation_status, '') = 'QR Scan' THEN 'QR_ATTENDANCE_AUTO'
    ELSE 'ATTENDANCE_AUTO'
  END;
  v_req_id := CASE
    WHEN v_source_type = 'QR_ATTENDANCE_AUTO' THEN 'otr-qr-'
    ELSE 'otr-att-'
  END || regexp_replace(NEW.employee_id, '[^a-zA-Z0-9_-]', '', 'g') || '-' || to_char(NEW.date, 'YYYY-MM-DD');

  INSERT INTO public.overtime_requests (
    id,
    request_number,
    employee_id,
    employee_code,
    employee_name,
    department,
    designation,
    overtime_date,
    purpose_category,
    project_purpose,
    source_type,
    expected_start_time,
    expected_end_time,
    expected_hours,
    actual_overtime_hours,
    overtime_reason,
    requested_by,
    requested_at,
    status,
    attendance_id,
    basic_salary_bdt,
    hourly_rate_bdt,
    overtime_multiplier,
    calculated_overtime_amount_bdt,
    is_payroll_processed,
    is_costing_allocated,
    created_at,
    updated_at
  ) VALUES (
    v_req_id,
    v_req_num,
    NEW.employee_id,
    COALESCE(NEW.employee_code, 'EMP-000'),
    COALESCE(NEW.employee_name, 'Staff Member'),
    COALESCE(NEW.department, 'Operations'),
    COALESCE(NEW.designation, 'Staff'),
    NEW.date,
    'General Operations',
    '',
    v_source_type,
    v_ot_start_hhmm,
    v_ot_end_hhmm,
    v_ot_hours,
    v_ot_hours,
    format('Auto-generated from Attendance (IN: %s, Shift End: %s, OUT: %s)', COALESCE(NEW.in_time, '—'), v_ot_start_hhmm, v_ot_end_hhmm),
    CASE WHEN v_source_type = 'QR_ATTENDANCE_AUTO' THEN 'QR Attendance Automation' ELSE 'Attendance Synchronization' END,
    NOW(),
    'Pending Supervisor',
    NEW.id,
    v_basic,
    v_hourly_rate,
    v_multiplier,
    v_total_amt,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  )
  ON CONFLICT (employee_id, overtime_date) WHERE status <> 'Cancelled' DO NOTHING;

  IF FOUND THEN
    v_audit_id := 'ota-trg-' || extract(epoch FROM clock_timestamp())::BIGINT::TEXT || '-' || substr(md5(random()::TEXT), 1, 5);
    INSERT INTO public.overtime_audit_logs (
      id, record_id, record_type, action, actor_name, actor_role, details, new_state
    ) VALUES (
      v_audit_id,
      v_req_id,
      'REQUEST',
      'ATTENDANCE_AUTO_CREATED',
      'PostgreSQL Attendance Sync',
      'System',
      format('Auto-generated %s for %s (%s): %sh OT (%s - %s).',
        v_req_num, COALESCE(NEW.employee_name, NEW.employee_id), NEW.date, v_ot_hours, v_ot_start_hhmm, v_ot_end_hhmm),
      'Pending Supervisor'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_attendance_to_overtime_request ON public.employee_attendances;

CREATE TRIGGER trg_sync_attendance_to_overtime_request
  AFTER INSERT OR UPDATE ON public.employee_attendances
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_attendance_to_overtime_request();

COMMIT;
