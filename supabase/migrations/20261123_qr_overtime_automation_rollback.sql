-- ============================================================================
-- Rollback: QR Code Attendance Automated Overtime & Overtime Purpose Settings
-- Date: 2026-11-23
-- ============================================================================

BEGIN;

DROP INDEX IF EXISTS public.uq_overtime_requests_employee_date;
DROP INDEX IF EXISTS public.idx_overtime_requests_source_type;

ALTER TABLE public.overtime_requests DROP COLUMN IF EXISTS purpose_selected_at;
ALTER TABLE public.overtime_requests DROP COLUMN IF EXISTS purpose_selected_by;
ALTER TABLE public.overtime_requests DROP COLUMN IF EXISTS purpose_id;
ALTER TABLE public.overtime_requests DROP COLUMN IF EXISTS source_type;

ALTER TABLE public.payroll_settings DROP COLUMN IF EXISTS overtime_purposes;

COMMIT;
