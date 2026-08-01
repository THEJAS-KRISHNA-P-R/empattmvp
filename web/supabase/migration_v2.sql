-- ============================================================
-- Migration: v1 -> v2
-- Run this in the Supabase SQL Editor against your EXISTING project
-- (the one whose credentials were in the old run-schema.js).
-- Safe to run once; each step is guarded so re-running it is a no-op.
--
-- What this does:
--   1. Adds hashed-passcode support and migrates existing plaintext
--      passcodes to bcrypt hashes, then drops the plaintext column.
--   2. Adds login-lockout tracking columns.
--   3. Adds geofence + sequence-anomaly columns to clock_logs.
-- ============================================================

-- pgcrypto gives us crypt()/gen_salt('bf', ...) — bcrypt, compatible
-- with the bcryptjs hashes the Next.js app verifies against.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1a. Add the new hashed-passcode column (nullable for now — we backfill next).
ALTER TABLE workers ADD COLUMN IF NOT EXISTS passcode_hash VARCHAR(72);

-- 1b. Backfill from the old plaintext `passcode` column, if it still exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workers' AND column_name = 'passcode'
  ) THEN
    UPDATE workers
    SET passcode_hash = crypt(passcode, gen_salt('bf', 10))
    WHERE passcode_hash IS NULL;

    ALTER TABLE workers DROP COLUMN passcode;
  END IF;
END $$;

-- 1c. Now that every row has a hash, enforce NOT NULL.
ALTER TABLE workers ALTER COLUMN passcode_hash SET NOT NULL;

-- 2. Login lockout tracking (DB-backed — see schema.sql comment on why
--    this can't be an in-memory rate limiter on serverless).
ALTER TABLE workers ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ DEFAULT NULL;

-- 3. Geofence + sequence-anomaly columns on clock_logs (flagged, not
--    blocking — see schema.sql comment).
ALTER TABLE clock_logs ADD COLUMN IF NOT EXISTS distance_from_site_meters DOUBLE PRECISION DEFAULT NULL;
ALTER TABLE clock_logs ADD COLUMN IF NOT EXISTS within_geofence BOOLEAN DEFAULT NULL;
ALTER TABLE clock_logs ADD COLUMN IF NOT EXISTS sequence_anomaly BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Device-uniqueness constraint: the SAME device can never be bound to
--    two DIFFERENT workers. This is the real backstop for
--    app/api/auth/login/route.ts's device-binding logic.
--
--    IMPORTANT: your app was previously using device_info_plus's `.id`
--    field as the "hardware UUID" — see CHANGES.md for why that's wrong
--    (it's the OS build label, identical across every phone on the same
--    firmware build, not a per-device identifier). That means it is
--    genuinely possible your live `workers` table already has two
--    different workers with the SAME bound_device_id, from before this
--    fix. Adding a unique constraint on top of existing duplicates would
--    fail outright, so this checks first and tells you exactly what to
--    resolve instead of crashing the whole migration.
DO $$
DECLARE
  dup_count INT;
  dup_list TEXT;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT bound_device_id
    FROM workers
    WHERE bound_device_id IS NOT NULL
    GROUP BY bound_device_id
    HAVING COUNT(*) > 1
  ) dupes;

  IF dup_count > 0 THEN
    SELECT string_agg(
      format('  device %s -> workers: %s', bound_device_id, worker_names), E'\n'
    ) INTO dup_list
    FROM (
      SELECT bound_device_id, string_agg(full_name || ' (' || phone || ')', ', ') AS worker_names
      FROM workers
      WHERE bound_device_id IS NOT NULL
      GROUP BY bound_device_id
      HAVING COUNT(*) > 1
    ) grouped;

    RAISE NOTICE E'\n=== ACTION NEEDED ===\nFound % device ID(s) currently bound to more than one worker (a real consequence of the old device_info_plus bug):\n%\nThe unique device-binding constraint was NOT created. Resolve these manually first — for each device listed, decide which worker actually owns it, unbind the other(s) via the admin dashboard (or `UPDATE workers SET bound_device_id = NULL WHERE id = \'...\'`), then re-run just this DO block (or the single CREATE UNIQUE INDEX statement below) to add the constraint.\n', dup_count, dup_list;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'idx_workers_bound_device_unique'
    ) THEN
      CREATE UNIQUE INDEX idx_workers_bound_device_unique
        ON workers(bound_device_id)
        WHERE bound_device_id IS NOT NULL;
      RAISE NOTICE 'Created idx_workers_bound_device_unique — device binding is now enforced at the database level.';
    ELSE
      RAISE NOTICE 'idx_workers_bound_device_unique already exists — nothing to do.';
    END IF;
  END IF;
END $$;

-- 5. Sanity check on existing geofence radii before making the column
--    NOT NULL + CHECK'd — a zero/negative radius makes a site impossible
--    to ever clock into "within geofence".
DO $$
BEGIN
  UPDATE work_sites SET radius_meters = 200 WHERE radius_meters IS NULL OR radius_meters <= 0;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'work_sites' AND constraint_name = 'work_sites_radius_meters_check'
  ) THEN
    ALTER TABLE work_sites ALTER COLUMN radius_meters SET NOT NULL;
    ALTER TABLE work_sites ADD CONSTRAINT work_sites_radius_meters_check CHECK (radius_meters > 0);
  END IF;
END $$;

-- 6. Employee ID — second login credential (phone + employee_id + PIN,
--    per the updated 3-factor login spec). Existing workers get an
--    auto-generated placeholder ID derived from their row id (guaranteed
--    unique, no collisions to resolve) — rename these to something
--    meaningful via the admin dashboard whenever convenient; nothing
--    breaks in the meantime.
ALTER TABLE workers ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50);

UPDATE workers
SET employee_id = 'EMP-' || upper(substring(id::text, 1, 6))
WHERE employee_id IS NULL;

DO $$
BEGIN
  ALTER TABLE workers ALTER COLUMN employee_id SET NOT NULL;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'workers_employee_id_key'
       OR indexname = 'idx_workers_employee_id_unique'
  ) THEN
    ALTER TABLE workers ADD CONSTRAINT workers_employee_id_key UNIQUE (employee_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workers_employee_id ON workers(employee_id);

-- Done. Verify with:
--   SELECT id, full_name, phone, passcode_hash, failed_login_attempts FROM workers;
--   \d clock_logs
--   \d workers   -- confirm idx_workers_bound_device_unique is listed
--
-- IMPORTANT — separate from this migration:
-- The plaintext DB password that was hardcoded in the old run-schema.js
-- must be rotated in Supabase (Project Settings -> Database -> Reset
-- Database Password), and the service role / anon keys should be rotated
-- too if this repo was ever pushed to a public git remote. This SQL
-- migration does not do that for you — it's a separate manual step.
