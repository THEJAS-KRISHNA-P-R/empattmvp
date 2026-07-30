-- ============================================================
-- Field Worker Management & GPS Attendance System
-- Supabase PostgreSQL Schema — Run in Supabase SQL Editor
-- ============================================================

-- Enable PostGIS for spatial queries and distance calculations
CREATE EXTENSION IF NOT EXISTS postgis;

-- -------------------------------------------------------
-- 1. WORKERS TABLE
-- Stores credentials and hardware UUID locks (device binding)
-- -------------------------------------------------------
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    passcode VARCHAR(10) NOT NULL,
    bound_device_id VARCHAR(128) DEFAULT NULL, -- NULL until first successful login (then permanently bound)
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
-- Every IN/OUT event with GPS accuracy & mock location detection
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
-- Disable for MVP — enable and configure per-user policies before production
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

-- Seed Demo Workers (passcodes are plain text for MVP — hash in production)
INSERT INTO workers (full_name, phone, passcode) VALUES
    ('John Field Worker', '+1234567890', '1234'),
    ('Sarah Inspector',   '+0987654321', '5678');
