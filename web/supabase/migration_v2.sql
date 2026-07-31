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

-- Done. Verify with:
--   SELECT id, full_name, phone, passcode_hash, failed_login_attempts FROM workers;
--   \d clock_logs
--
-- IMPORTANT — separate from this migration:
-- The plaintext DB password that was hardcoded in the old run-schema.js
-- must be rotated in Supabase (Project Settings -> Database -> Reset
-- Database Password), and the service role / anon keys should be rotated
-- too if this repo was ever pushed to a public git remote. This SQL
-- migration does not do that for you — it's a separate manual step.
