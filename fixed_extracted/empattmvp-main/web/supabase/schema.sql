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

    -- bcrypt hash of the 4-digit passcode (NEVER store the raw passcode).
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
    radius_meters INT DEFAULT 200,
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
CREATE INDEX idx_clock_logs_date ON clock_logs((client_timestamp::DATE));
CREATE INDEX idx_clock_logs_site ON clock_logs(site_id);
CREATE INDEX idx_workers_phone ON workers(phone);

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
-- Passcodes below are bcrypt hashes (cost factor 10) of the demo
-- passcodes '1234' and '5678' — the raw passcodes are never stored.
-- To seed a NEW worker with your own passcode, generate a hash with:
--   node -e "console.log(require('bcryptjs').hashSync('YOUR_4_DIGITS', 10))"
INSERT INTO workers (full_name, phone, passcode_hash) VALUES
    ('John Field Worker', '+1234567890', '$2b$10$iznqLo1HQzLXJyL2S.7HrOW610FBmh1As7leTX4HdtRUzVhuQn7c6'), -- passcode: 1234
    ('Sarah Inspector',   '+0987654321', '$2b$10$s03O8ff9rGipfEuJe7GnRunqaJt3GBYZV0XVFjWG7OVA2bweEW12S'); -- passcode: 5678
