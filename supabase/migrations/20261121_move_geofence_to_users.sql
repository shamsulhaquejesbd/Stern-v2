-- ============================================================================
-- Migration: Relocate Assigned Office GPS Location & Shift Geofence
--            from public.field_force_reps -> public.users
-- Date: 2026-11-21
-- Safety Guarantees:
--   1. Transactional execution (all-or-nothing).
--   2. Preserves all employee records, attendance history (employee_attendances),
--      and rejected GPS logs (attendance_rejected_attempts) untouched.
--   3. Migrates valid employee->user mappings into public.users (1:1 by User ID).
--   4. Preserves any unmatched employee geofence records in
--      public.employee_geofence_unmatched_backup for manual reconciliation.
--   5. Verifies 100% migration/backup coverage BEFORE dropping legacy columns
--      from public.field_force_reps.
-- ============================================================================

BEGIN;

-- 1. Add User-owned GPS Location & Shift Geofence columns on public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS assigned_office_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS assigned_office_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS office_latitude NUMERIC(10, 7);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS office_longitude NUMERIC(10, 7);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS allowed_radius_meters INT DEFAULT 200;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS office_address TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS location_status TEXT DEFAULT 'Active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS shift_start_time TEXT DEFAULT '09:00';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS shift_end_time TEXT DEFAULT '18:00';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS grace_period_minutes INT DEFAULT 15;

CREATE INDEX IF NOT EXISTS idx_users_assigned_office ON public.users(assigned_office_id);

-- 2. Backfill from transitional permissions->'geofence' JSONB on public.users if present
UPDATE public.users
SET
  assigned_office_id = COALESCE(NULLIF(TRIM(assigned_office_id), ''), NULLIF(TRIM(permissions->'geofence'->>'assignedOfficeId'), '')),
  assigned_office_name = COALESCE(NULLIF(TRIM(assigned_office_name), ''), NULLIF(TRIM(permissions->'geofence'->>'assignedOfficeName'), '')),
  office_latitude = COALESCE(
    office_latitude,
    CASE
      WHEN (permissions->'geofence'->>'officeLatitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (permissions->'geofence'->>'officeLatitude')::NUMERIC(10, 7)
      ELSE NULL
    END
  ),
  office_longitude = COALESCE(
    office_longitude,
    CASE
      WHEN (permissions->'geofence'->>'officeLongitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (permissions->'geofence'->>'officeLongitude')::NUMERIC(10, 7)
      ELSE NULL
    END
  ),
  allowed_radius_meters = COALESCE(
    allowed_radius_meters,
    CASE
      WHEN (permissions->'geofence'->>'allowedRadiusMeters') ~ '^[0-9]+$'
      THEN (permissions->'geofence'->>'allowedRadiusMeters')::INT
      ELSE NULL
    END
  ),
  office_address = COALESCE(NULLIF(TRIM(office_address), ''), NULLIF(TRIM(permissions->'geofence'->>'officeAddress'), '')),
  location_status = COALESCE(NULLIF(TRIM(location_status), ''), NULLIF(TRIM(permissions->'geofence'->>'locationStatus'), ''), 'Active'),
  shift_start_time = COALESCE(NULLIF(TRIM(shift_start_time), ''), NULLIF(TRIM(permissions->'geofence'->>'shiftStartTime'), ''), '09:00'),
  shift_end_time = COALESCE(NULLIF(TRIM(shift_end_time), ''), NULLIF(TRIM(permissions->'geofence'->>'shiftEndTime'), ''), '18:00'),
  grace_period_minutes = COALESCE(
    grace_period_minutes,
    CASE
      WHEN (permissions->'geofence'->>'gracePeriodMinutes') ~ '^[0-9]+$'
      THEN (permissions->'geofence'->>'gracePeriodMinutes')::INT
      ELSE NULL
    END
  ),
  updated_at = NOW()
WHERE permissions IS NOT NULL
  AND jsonb_typeof(permissions) = 'object'
  AND permissions ? 'geofence';

-- 3. Reconciliation backup table for unmatched employee GPS/Geofence configurations
CREATE TABLE IF NOT EXISTS public.employee_geofence_unmatched_backup (
  employee_id BIGINT PRIMARY KEY,
  employee_code TEXT,
  employee_name TEXT,
  employee_email TEXT,
  employee_phone TEXT,
  legacy_user_id TEXT,
  assigned_office_id TEXT,
  assigned_office_name TEXT,
  office_latitude NUMERIC(10, 7),
  office_longitude NUMERIC(10, 7),
  allowed_radius_meters INT,
  office_address TEXT,
  location_status TEXT,
  shift_start_time TEXT,
  shift_end_time TEXT,
  grace_period_minutes INT,
  reconciled_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT DEFAULT 'Preserved automatically because no matching public.users row existed during migration'
);

ALTER TABLE public.employee_geofence_unmatched_backup ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all employee_geofence_unmatched_backup" ON public.employee_geofence_unmatched_backup;
CREATE POLICY "Allow public all employee_geofence_unmatched_backup"
  ON public.employee_geofence_unmatched_backup FOR ALL USING (true) WITH CHECK (true);

-- 4. Migrate existing GPS/Geofence/Shift settings from public.field_force_reps -> public.users
--    ONLY when legacy columns still exist on public.field_force_reps
DO $$
DECLARE
  has_legacy_cols BOOLEAN;
  emp_total_with_geo INT := 0;
  emp_matched_count INT := 0;
  emp_unmatched_count INT := 0;
  backup_recorded_count INT := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'field_force_reps'
      AND column_name IN (
        'assigned_office_id',
        'assigned_office_name',
        'office_latitude',
        'office_longitude',
        'allowed_radius_meters',
        'office_address',
        'location_status',
        'shift_start_time',
        'shift_end_time',
        'grace_period_minutes'
      )
  ) INTO has_legacy_cols;

  IF NOT has_legacy_cols THEN
    RAISE NOTICE 'Legacy GPS/Geofence columns already absent on public.field_force_reps; skipping employee migration step.';
    RETURN;
  END IF;

  -- Build deterministic 1:1 mapping from field_force_reps -> users
  CREATE TEMP TABLE _emp_user_geo_map ON COMMIT DROP AS
  WITH source_reps AS (
    SELECT
      r.id AS rep_id,
      r.code AS rep_code,
      r.name AS rep_name,
      r.email AS rep_email,
      r.phone AS rep_phone,
      r.user_id AS rep_user_id,
      r.assigned_office_id,
      r.assigned_office_name,
      r.office_latitude,
      r.office_longitude,
      r.allowed_radius_meters,
      r.office_address,
      r.location_status,
      r.shift_start_time,
      r.shift_end_time,
      r.grace_period_minutes,
      r.updated_at
    FROM public.field_force_reps r
    WHERE NULLIF(TRIM(r.assigned_office_id), '') IS NOT NULL
       OR NULLIF(TRIM(r.assigned_office_name), '') IS NOT NULL
       OR r.office_latitude IS NOT NULL
       OR r.office_longitude IS NOT NULL
       OR r.allowed_radius_meters IS NOT NULL
       OR NULLIF(TRIM(r.office_address), '') IS NOT NULL
       OR NULLIF(TRIM(r.location_status), '') IS NOT NULL
       OR NULLIF(TRIM(r.shift_start_time), '') IS NOT NULL
       OR NULLIF(TRIM(r.shift_end_time), '') IS NOT NULL
       OR r.grace_period_minutes IS NOT NULL
  ),
  ranked_matches AS (
    SELECT
      sr.*,
      u.id AS matched_user_pk,
      CASE
        WHEN NULLIF(TRIM(sr.rep_user_id), '') IS NOT NULL
          AND (
            LOWER(TRIM(u.uid)) = LOWER(TRIM(sr.rep_user_id))
            OR LOWER(TRIM(u.user_id)) = LOWER(TRIM(sr.rep_user_id))
            OR u.id::TEXT = TRIM(sr.rep_user_id)
          ) THEN 1
        WHEN NULLIF(TRIM(sr.rep_code), '') IS NOT NULL
          AND (
            LOWER(TRIM(u.salesman_code)) = LOWER(TRIM(sr.rep_code))
            OR LOWER(TRIM(u.user_id)) = LOWER(TRIM(sr.rep_code))
            OR LOWER(TRIM(u.uid)) = LOWER(TRIM(sr.rep_code))
          ) THEN 2
        WHEN NULLIF(TRIM(sr.rep_email), '') IS NOT NULL
          AND LOWER(TRIM(u.email)) = LOWER(TRIM(sr.rep_email)) THEN 3
        WHEN LENGTH(REGEXP_REPLACE(COALESCE(sr.rep_phone, ''), '[^0-9]', '', 'g')) >= 8
          AND RIGHT(REGEXP_REPLACE(COALESCE(u.phone, ''), '[^0-9]', '', 'g'), 10)
            = RIGHT(REGEXP_REPLACE(COALESCE(sr.rep_phone, ''), '[^0-9]', '', 'g'), 10)
          AND REGEXP_REPLACE(COALESCE(sr.rep_phone, ''), '[^0-9]', '', 'g') !~ '^0+$' THEN 4
        WHEN NULLIF(TRIM(sr.rep_name), '') IS NOT NULL
          AND LOWER(TRIM(u.name)) = LOWER(TRIM(sr.rep_name)) THEN 5
        ELSE 99
      END AS match_priority
    FROM source_reps sr
    JOIN public.users u ON (
      (NULLIF(TRIM(sr.rep_user_id), '') IS NOT NULL AND (
        LOWER(TRIM(u.uid)) = LOWER(TRIM(sr.rep_user_id))
        OR LOWER(TRIM(u.user_id)) = LOWER(TRIM(sr.rep_user_id))
        OR u.id::TEXT = TRIM(sr.rep_user_id)
      ))
      OR (NULLIF(TRIM(sr.rep_code), '') IS NOT NULL AND (
        LOWER(TRIM(u.salesman_code)) = LOWER(TRIM(sr.rep_code))
        OR LOWER(TRIM(u.user_id)) = LOWER(TRIM(sr.rep_code))
        OR LOWER(TRIM(u.uid)) = LOWER(TRIM(sr.rep_code))
      ))
      OR (NULLIF(TRIM(sr.rep_email), '') IS NOT NULL AND LOWER(TRIM(u.email)) = LOWER(TRIM(sr.rep_email)))
      OR (
        LENGTH(REGEXP_REPLACE(COALESCE(sr.rep_phone, ''), '[^0-9]', '', 'g')) >= 8
        AND LENGTH(REGEXP_REPLACE(COALESCE(u.phone, ''), '[^0-9]', '', 'g')) >= 8
        AND RIGHT(REGEXP_REPLACE(COALESCE(u.phone, ''), '[^0-9]', '', 'g'), 10)
          = RIGHT(REGEXP_REPLACE(COALESCE(sr.rep_phone, ''), '[^0-9]', '', 'g'), 10)
        AND REGEXP_REPLACE(COALESCE(sr.rep_phone, ''), '[^0-9]', '', 'g') !~ '^0+$'
      )
      OR (NULLIF(TRIM(sr.rep_name), '') IS NOT NULL AND LOWER(TRIM(u.name)) = LOWER(TRIM(sr.rep_name)))
    )
  ),
  best_per_rep AS (
    SELECT DISTINCT ON (rep_id) *
    FROM ranked_matches
    ORDER BY rep_id, match_priority ASC, matched_user_pk ASC
  ),
  best_per_user AS (
    SELECT DISTINCT ON (matched_user_pk) *
    FROM best_per_rep
    ORDER BY matched_user_pk, match_priority ASC, updated_at DESC NULLS LAST, rep_id DESC
  )
  SELECT * FROM best_per_user;

  -- Update matched public.users rows without clobbering already-populated user settings
  UPDATE public.users u
  SET
    assigned_office_id = COALESCE(NULLIF(TRIM(u.assigned_office_id), ''), NULLIF(TRIM(m.assigned_office_id), '')),
    assigned_office_name = COALESCE(NULLIF(TRIM(u.assigned_office_name), ''), NULLIF(TRIM(m.assigned_office_name), '')),
    office_latitude = COALESCE(u.office_latitude, m.office_latitude),
    office_longitude = COALESCE(u.office_longitude, m.office_longitude),
    allowed_radius_meters = COALESCE(u.allowed_radius_meters, m.allowed_radius_meters),
    office_address = COALESCE(NULLIF(TRIM(u.office_address), ''), NULLIF(TRIM(m.office_address), '')),
    location_status = COALESCE(NULLIF(TRIM(u.location_status), ''), NULLIF(TRIM(m.location_status), ''), 'Active'),
    shift_start_time = COALESCE(NULLIF(TRIM(u.shift_start_time), ''), NULLIF(TRIM(m.shift_start_time), ''), '09:00'),
    shift_end_time = COALESCE(NULLIF(TRIM(u.shift_end_time), ''), NULLIF(TRIM(m.shift_end_time), ''), '18:00'),
    grace_period_minutes = COALESCE(u.grace_period_minutes, m.grace_period_minutes, 15),
    updated_at = NOW()
  FROM _emp_user_geo_map m
  WHERE u.id = m.matched_user_pk;

  -- Preserve all source_reps NOT matched to a user into employee_geofence_unmatched_backup
  INSERT INTO public.employee_geofence_unmatched_backup (
    employee_id,
    employee_code,
    employee_name,
    employee_email,
    employee_phone,
    legacy_user_id,
    assigned_office_id,
    assigned_office_name,
    office_latitude,
    office_longitude,
    allowed_radius_meters,
    office_address,
    location_status,
    shift_start_time,
    shift_end_time,
    grace_period_minutes,
    archived_at
  )
  SELECT
    r.id,
    r.code,
    r.name,
    r.email,
    r.phone,
    r.user_id,
    r.assigned_office_id,
    r.assigned_office_name,
    r.office_latitude,
    r.office_longitude,
    r.allowed_radius_meters,
    r.office_address,
    r.location_status,
    r.shift_start_time,
    r.shift_end_time,
    r.grace_period_minutes,
    NOW()
  FROM public.field_force_reps r
  WHERE (
    NULLIF(TRIM(r.assigned_office_id), '') IS NOT NULL
    OR NULLIF(TRIM(r.assigned_office_name), '') IS NOT NULL
    OR r.office_latitude IS NOT NULL
    OR r.office_longitude IS NOT NULL
    OR r.allowed_radius_meters IS NOT NULL
    OR NULLIF(TRIM(r.office_address), '') IS NOT NULL
    OR NULLIF(TRIM(r.location_status), '') IS NOT NULL
    OR NULLIF(TRIM(r.shift_start_time), '') IS NOT NULL
    OR NULLIF(TRIM(r.shift_end_time), '') IS NOT NULL
    OR r.grace_period_minutes IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM _emp_user_geo_map m WHERE m.rep_id = r.id
  )
  ON CONFLICT (employee_id) DO UPDATE SET
    employee_code = EXCLUDED.employee_code,
    employee_name = EXCLUDED.employee_name,
    assigned_office_id = EXCLUDED.assigned_office_id,
    assigned_office_name = EXCLUDED.assigned_office_name,
    office_latitude = EXCLUDED.office_latitude,
    office_longitude = EXCLUDED.office_longitude,
    allowed_radius_meters = EXCLUDED.allowed_radius_meters,
    office_address = EXCLUDED.office_address,
    location_status = EXCLUDED.location_status,
    shift_start_time = EXCLUDED.shift_start_time,
    shift_end_time = EXCLUDED.shift_end_time,
    grace_period_minutes = EXCLUDED.grace_period_minutes,
    archived_at = NOW();

  -- Verification Gate BEFORE dropping legacy columns
  SELECT COUNT(*) INTO emp_total_with_geo
  FROM public.field_force_reps r
  WHERE NULLIF(TRIM(r.assigned_office_id), '') IS NOT NULL
     OR NULLIF(TRIM(r.assigned_office_name), '') IS NOT NULL
     OR r.office_latitude IS NOT NULL
     OR r.office_longitude IS NOT NULL
     OR r.allowed_radius_meters IS NOT NULL
     OR NULLIF(TRIM(r.office_address), '') IS NOT NULL
     OR NULLIF(TRIM(r.location_status), '') IS NOT NULL
     OR NULLIF(TRIM(r.shift_start_time), '') IS NOT NULL
     OR NULLIF(TRIM(r.shift_end_time), '') IS NOT NULL
     OR r.grace_period_minutes IS NOT NULL;

  SELECT COUNT(*) INTO emp_matched_count FROM _emp_user_geo_map;

  SELECT COUNT(*) INTO emp_unmatched_count
  FROM public.field_force_reps r
  WHERE (
    NULLIF(TRIM(r.assigned_office_id), '') IS NOT NULL
    OR NULLIF(TRIM(r.assigned_office_name), '') IS NOT NULL
    OR r.office_latitude IS NOT NULL
    OR r.office_longitude IS NOT NULL
    OR r.allowed_radius_meters IS NOT NULL
    OR NULLIF(TRIM(r.office_address), '') IS NOT NULL
    OR NULLIF(TRIM(r.location_status), '') IS NOT NULL
    OR NULLIF(TRIM(r.shift_start_time), '') IS NOT NULL
    OR NULLIF(TRIM(r.shift_end_time), '') IS NOT NULL
    OR r.grace_period_minutes IS NOT NULL
  )
  AND NOT EXISTS (SELECT 1 FROM _emp_user_geo_map m WHERE m.rep_id = r.id);

  SELECT COUNT(*) INTO backup_recorded_count
  FROM public.employee_geofence_unmatched_backup;

  IF (emp_matched_count + backup_recorded_count) < emp_total_with_geo THEN
    RAISE EXCEPTION 'Migration safety verification failed: total source rows with geofence=%, matched=%, backed_up=%',
      emp_total_with_geo, emp_matched_count, backup_recorded_count;
  END IF;

  RAISE NOTICE 'Geofence migration verified: source_with_geo=%, migrated_to_users=%, unmatched_backed_up=%',
    emp_total_with_geo, emp_matched_count, emp_unmatched_count;
END $$;

-- 5. Remove legacy GPS/Geofence columns from public.field_force_reps ONLY after verification
ALTER TABLE public.field_force_reps DROP COLUMN IF EXISTS assigned_office_id;
ALTER TABLE public.field_force_reps DROP COLUMN IF EXISTS assigned_office_name;
ALTER TABLE public.field_force_reps DROP COLUMN IF EXISTS office_latitude;
ALTER TABLE public.field_force_reps DROP COLUMN IF EXISTS office_longitude;
ALTER TABLE public.field_force_reps DROP COLUMN IF EXISTS allowed_radius_meters;
ALTER TABLE public.field_force_reps DROP COLUMN IF EXISTS office_address;
ALTER TABLE public.field_force_reps DROP COLUMN IF EXISTS location_status;
ALTER TABLE public.field_force_reps DROP COLUMN IF EXISTS shift_start_time;
ALTER TABLE public.field_force_reps DROP COLUMN IF EXISTS shift_end_time;
ALTER TABLE public.field_force_reps DROP COLUMN IF EXISTS grace_period_minutes;

COMMIT;
