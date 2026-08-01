-- ============================================================
-- Field Worker Management & GPS Attendance System
-- Supabase PostgreSQL Schema — Run in Supabase SQL Editor
--
-- SETUP: paste this whole file into the Supabase SQL Editor and run it.
-- Do NOT write a script that embeds your DB password to run this —
-- that is how the previous version of this project leaked its
-- superuser connection string into source control. The SQL Editor
-- (or `supabase db push` with the CLI, which uses your logged-in
-- session, not a hardcoded password) is the safe way to apply this.
-- ============================================================

-- PostGIS is enabled for future use but NOT currently used for spatial
-- queries. This MVP computes geofence distance in the API layer with a
-- plain Haversine formula (see app/api/attendance/clock/route.ts) — that's
-- plenty accurate at this scale (a handful of workers, a few events/day)
-- and avoids the extra complexity of geography columns + spatial indexes.
-- If this grows to thousands of events/day, migrate distance checks to
-- native ST_DWithin queries against a geography(Point,4326) column.
CREATE EXTENSION IF NOT EXISTS postgis;

-- -------------------------------------------------------
-- 1. WORKERS TABLE
-- Stores credentials and hardware ID locks (device binding)
-- -------------------------------------------------------
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,

    -- Second login credential, admin-assigned. Deliberately not validated
    -- as a real email — field workers often don't have one, so an admin
    -- can just assign a plain ID like "EMP001" instead. Login requires
    -- phone + employee_id + PIN to all match, not just PIN alone.
    employee_id VARCHAR(50) UNIQUE NOT NULL,

    -- bcrypt hash of the PIN/password (NEVER store the raw value).
    -- bcrypt output is always 60 chars; VARCHAR(72) gives headroom.
    passcode_hash VARCHAR(72) NOT NULL,

    -- Settings.Secure.ANDROID_ID (via the `android_id` package — see
    -- mobile/lib/services/device_service.dart). NOT device_info_plus's
    -- `.id` field, which is the OS build label and is IDENTICAL across
    -- every phone on the same firmware build, not unique per device.
    bound_device_id VARCHAR(128) DEFAULT NULL, -- NULL until first successful login (then permanently bound)

    -- Login lockout (see /api/auth/login). Tracked in the DB, not in
    -- memory, because serverless functions don't share memory between
    -- invocations — an in-process rate limiter would do nothing here.
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ DEFAULT NULL,

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- 2. WORK SITES TABLE
-- Assigned field locations with GPS geofence radius
-- -------------------------------------------------------
CREATE TABLE work_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius_meters INT NOT NULL DEFAULT 200 CHECK (radius_meters > 0),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- 3. CLOCK LOGS TABLE
-- Every IN/OUT event with GPS accuracy, mock-location, geofence
-- and sequence-anomaly detection
-- -------------------------------------------------------
CREATE TABLE clock_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES work_sites(id) ON DELETE RESTRICT,
    event_type VARCHAR(10) NOT NULL CHECK (event_type IN ('IN', 'OUT')),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy_meters DOUBLE PRECISION DEFAULT 0,
    is_mock_location BOOLEAN DEFAULT FALSE,

    -- Geofence check (flagged, not blocking — same philosophy as
    -- is_mock_location: record it, let the admin judge, never lock a
    -- worker out of clocking in over a GPS reading).
    distance_from_site_meters DOUBLE PRECISION DEFAULT NULL,
    within_geofence BOOLEAN DEFAULT NULL,

    -- True if this event breaks the expected IN/OUT alternation for the
    -- worker (e.g. two INs in a row). Flagged for the admin, not blocked,
    -- because rejecting it risks locking a worker out over a missed sync.
    sequence_anomaly BOOLEAN NOT NULL DEFAULT FALSE,

    client_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- INDEXES — for rapid Admin Dashboard filtering
-- -------------------------------------------------------
CREATE INDEX idx_clock_logs_worker_time ON clock_logs(worker_id, client_timestamp DESC);
-- Cast through a fixed UTC offset, not a plain ::date cast — a bare
-- `client_timestamp::DATE` cast depends on the connection's session
-- timezone (STABLE, not IMMUTABLE), which Postgres rejects in an index
-- expression. This was caught by actually running this file against a
-- real Postgres instance, not by inspection.
CREATE INDEX idx_clock_logs_date ON clock_logs(((client_timestamp AT TIME ZONE 'UTC')::date));
CREATE INDEX idx_clock_logs_site ON clock_logs(site_id);
CREATE INDEX idx_workers_phone ON workers(phone);
CREATE INDEX idx_workers_employee_id ON workers(employee_id);

-- Enforces the OTHER direction of "1:1 hardware device binding" that the
-- application-layer check alone can't fully guarantee under concurrent
-- requests: the SAME device can never be bound to two DIFFERENT workers
-- at once. Partial (WHERE bound_device_id IS NOT NULL) because multiple
-- workers legitimately have bound_device_id = NULL before their first
-- login. This is the actual race-safety backstop for
-- app/api/auth/login/route.ts — see the comment there.
CREATE UNIQUE INDEX idx_workers_bound_device_unique
  ON workers(bound_device_id)
  WHERE bound_device_id IS NOT NULL;

-- -------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- Disabled for MVP — all access goes through Next.js API routes using
-- the service role key, which bypasses RLS entirely. The admin dashboard
-- itself is protected by a separate password gate (see middleware.ts),
-- not by RLS/Supabase Auth. Before handing real worker PII to a real
-- client beyond a demo, replace this with Supabase Auth + per-row
-- policies scoped to an authenticated admin/org.
-- -------------------------------------------------------
ALTER TABLE workers DISABLE ROW LEVEL SECURITY;
ALTER TABLE work_sites DISABLE ROW LEVEL SECURITY;
ALTER TABLE clock_logs DISABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- SEED DATA — Demo sites near Bangalore, India
-- Replace coordinates with locations near your testing area
-- -------------------------------------------------------
INSERT INTO work_sites (name, latitude, longitude, radius_meters) VALUES
    ('North Field Project A', 12.9716, 77.5946, 300),
    ('South Orchard Site B',  12.9250, 77.5890, 250);

-- Seed Demo Workers.
-- PINs below are bcrypt hashes (cost factor 10) of the demo PINs '1234'
-- and '5678' — the raw PIN is never stored. Login now requires phone +
-- employee_id + PIN all three to match (see app/api/auth/login/route.ts).
-- To seed a NEW worker with your own PIN, generate a hash with:
--   node -e "console.log(require('bcryptjs').hashSync('YOUR_PIN', 10))"
-- (or just use the admin dashboard's Add Worker form instead — it does
-- this for you)
INSERT INTO workers (full_name, phone, employee_id, passcode_hash) VALUES
    ('John Field Worker', '+1234567890', 'EMP001', '$2b$10$iznqLo1HQzLXJyL2S.7HrOW610FBmh1As7leTX4HdtRUzVhuQn7c6'), -- PIN: 1234
    ('Sarah Inspector',   '+0987654321', 'EMP002', '$2b$10$s03O8ff9rGipfEuJe7GnRunqaJt3GBYZV0XVFjWG7OVA2bweEW12S'); -- PIN: 5678
