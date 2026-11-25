-- ============================================================================
-- Migration: QR Code Attendance Automated Overtime & Overtime Purpose Settings
-- Date: 2026-11-23
-- ============================================================================

BEGIN;

-- 1. Payroll Settings: Add Overtime Purposes JSONB array (reusing public.payroll_settings)
ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS overtime_purposes JSONB;

UPDATE public.payroll_settings
SET overtime_purposes = '[
  {"id":"otp-super-vasmol-kesh-kala","name":"Super Vasmol Kesh Kala","isActive":true},
  {"id":"otp-vasmol-kali-mehendi","name":"Vasmol Kali Mehendi","isActive":true},
  {"id":"otp-hair-oil-serum","name":"Hair Oil & Serum","isActive":true},
  {"id":"otp-developer","name":"Developer","isActive":true},
  {"id":"otp-shampoo-cream-hair-color","name":"Shampoo & Cream Hair Color","isActive":true},
  {"id":"otp-security-reason-production","name":"Security Reason Production Work","isActive":true},
  {"id":"otp-urgent-dispatch","name":"Urgent Dispatch","isActive":true},
  {"id":"otp-factory-maintenance","name":"Factory Maintenance","isActive":true},
  {"id":"otp-additional-assembly","name":"Additional Assembly","isActive":true},
  {"id":"otp-emergency-work","name":"Emergency Work","isActive":true}
]'::jsonb
WHERE overtime_purposes IS NULL;

-- 2. Overtime Requests: Add automation source & approver purpose selection metadata
ALTER TABLE public.overtime_requests
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'MANUAL';

ALTER TABLE public.overtime_requests
  ADD COLUMN IF NOT EXISTS purpose_id TEXT;

ALTER TABLE public.overtime_requests
  ADD COLUMN IF NOT EXISTS purpose_selected_by TEXT;

ALTER TABLE public.overtime_requests
  ADD COLUMN IF NOT EXISTS purpose_selected_at TIMESTAMPTZ;

-- 3. Prevent duplicate Overtime Requests per Employee + Attendance Date
-- Safely deduplicate any pre-existing duplicate active rows (marking superseded duplicates Cancelled)
-- before creating the unique index.
DO $$
BEGIN
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY employee_id, overtime_date
        ORDER BY
          CASE status
            WHEN 'Final Approved' THEN 1
            WHEN 'HR Verified' THEN 2
            WHEN 'Production Approved' THEN 3
            WHEN 'Supervisor Approved' THEN 4
            WHEN 'Pending Supervisor' THEN 5
            WHEN 'Draft' THEN 6
            WHEN 'Rejected' THEN 7
            ELSE 8
          END ASC,
          updated_at DESC NULLS LAST,
          created_at DESC NULLS LAST
      ) AS rn
    FROM public.overtime_requests
    WHERE status <> 'Cancelled'
  )
  UPDATE public.overtime_requests r
  SET
    status = 'Cancelled',
    updated_at = NOW()
  FROM ranked
  WHERE r.id = ranked.id
    AND ranked.rn > 1;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_overtime_requests_employee_date
  ON public.overtime_requests (employee_id, overtime_date)
  WHERE status <> 'Cancelled';

CREATE INDEX IF NOT EXISTS idx_overtime_requests_source_type
  ON public.overtime_requests (source_type);

COMMIT;
