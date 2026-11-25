-- ============================================================================
-- Rollback Migration: Restore GPS Location & Shift Geofence columns
--                     back to public.field_force_reps from public.users
--                     and employee_geofence_unmatched_backup
-- Date: 2026-11-21
-- ============================================================================

BEGIN;

-- 1. Re-add GPS/Geofence columns on public.field_force_reps
ALTER TABLE public.field_force_reps ADD COLUMN IF NOT EXISTS assigned_office_id TEXT;
ALTER TABLE public.field_force_reps ADD COLUMN IF NOT EXISTS assigned_office_name TEXT;
ALTER TABLE public.field_force_reps ADD COLUMN IF NOT EXISTS office_latitude NUMERIC(10, 7);
ALTER TABLE public.field_force_reps ADD COLUMN IF NOT EXISTS office_longitude NUMERIC(10, 7);
ALTER TABLE public.field_force_reps ADD COLUMN IF NOT EXISTS allowed_radius_meters INT DEFAULT 200;
ALTER TABLE public.field_force_reps ADD COLUMN IF NOT EXISTS office_address TEXT;
ALTER TABLE public.field_force_reps ADD COLUMN IF NOT EXISTS location_status TEXT DEFAULT 'Active';
ALTER TABLE public.field_force_reps ADD COLUMN IF NOT EXISTS shift_start_time TEXT DEFAULT '09:00';
ALTER TABLE public.field_force_reps ADD COLUMN IF NOT EXISTS shift_end_time TEXT DEFAULT '18:00';
ALTER TABLE public.field_force_reps ADD COLUMN IF NOT EXISTS grace_period_minutes INT DEFAULT 15;

-- 2. Restore unmatched backup records to field_force_reps first
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'employee_geofence_unmatched_backup'
  ) THEN
    UPDATE public.field_force_reps r
    SET
      assigned_office_id = b.assigned_office_id,
      assigned_office_name = b.assigned_office_name,
      office_latitude = b.office_latitude,
      office_longitude = b.office_longitude,
      allowed_radius_meters = b.allowed_radius_meters,
      office_address = b.office_address,
      location_status = b.location_status,
      shift_start_time = b.shift_start_time,
      shift_end_time = b.shift_end_time,
      grace_period_minutes = b.grace_period_minutes
    FROM public.employee_geofence_unmatched_backup b
    WHERE r.id = b.employee_id;
  END IF;
END $$;

-- 3. Restore User-linked GPS/Geofence configs back onto matching field_force_reps rows
UPDATE public.field_force_reps r
SET
  assigned_office_id = COALESCE(r.assigned_office_id, u.assigned_office_id),
  assigned_office_name = COALESCE(r.assigned_office_name, u.assigned_office_name),
  office_latitude = COALESCE(r.office_latitude, u.office_latitude),
  office_longitude = COALESCE(r.office_longitude, u.office_longitude),
  allowed_radius_meters = COALESCE(r.allowed_radius_meters, u.allowed_radius_meters),
  office_address = COALESCE(r.office_address, u.office_address),
  location_status = COALESCE(r.location_status, u.location_status),
  shift_start_time = COALESCE(r.shift_start_time, u.shift_start_time),
  shift_end_time = COALESCE(r.shift_end_time, u.shift_end_time),
  grace_period_minutes = COALESCE(r.grace_period_minutes, u.grace_period_minutes)
FROM public.users u
WHERE (
  (NULLIF(TRIM(r.user_id), '') IS NOT NULL AND (
    LOWER(TRIM(u.uid)) = LOWER(TRIM(r.user_id))
    OR LOWER(TRIM(u.user_id)) = LOWER(TRIM(r.user_id))
    OR u.id::TEXT = TRIM(r.user_id)
  ))
  OR (NULLIF(TRIM(r.code), '') IS NOT NULL AND (
    LOWER(TRIM(u.salesman_code)) = LOWER(TRIM(r.code))
    OR LOWER(TRIM(u.user_id)) = LOWER(TRIM(r.code))
  ))
  OR (NULLIF(TRIM(r.email), '') IS NOT NULL AND LOWER(TRIM(u.email)) = LOWER(TRIM(r.email)))
);

-- 4. Remove relocated columns from public.users
DROP INDEX IF EXISTS idx_users_assigned_office;
ALTER TABLE public.users DROP COLUMN IF EXISTS assigned_office_id;
ALTER TABLE public.users DROP COLUMN IF EXISTS assigned_office_name;
ALTER TABLE public.users DROP COLUMN IF EXISTS office_latitude;
ALTER TABLE public.users DROP COLUMN IF EXISTS office_longitude;
ALTER TABLE public.users DROP COLUMN IF EXISTS allowed_radius_meters;
ALTER TABLE public.users DROP COLUMN IF EXISTS office_address;
ALTER TABLE public.users DROP COLUMN IF EXISTS location_status;
ALTER TABLE public.users DROP COLUMN IF EXISTS shift_start_time;
ALTER TABLE public.users DROP COLUMN IF EXISTS shift_end_time;
ALTER TABLE public.users DROP COLUMN IF EXISTS grace_period_minutes;

COMMIT;
