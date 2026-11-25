-- ============================================================================
-- Rollback: Automatic Attendance <-> Overtime Requisition Synchronization
-- ============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_sync_attendance_to_overtime_request ON public.employee_attendances;
DROP FUNCTION IF EXISTS public.fn_sync_attendance_to_overtime_request();
DROP FUNCTION IF EXISTS public.fn_parse_time_to_minutes(TEXT);

ALTER TABLE public.overtime_requests
  DROP COLUMN IF EXISTS cancellation_reason,
  DROP COLUMN IF EXISTS cancelled_by,
  DROP COLUMN IF EXISTS cancelled_at;

COMMIT;
