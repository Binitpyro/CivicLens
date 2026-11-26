-- CivicLens PostGIS Schema Migration
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT)

CREATE EXTENSION IF NOT EXISTS postgis;

-- Users table (phone-based auth, role-gated)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT CHECK (role IN ('admin','surveyor','viewer','panchayat_officer')) DEFAULT 'viewer',
    ward_id INTEGER,
    created_at TIMESTAMP DEFAULT now()
);

-- Villages (one per deployment)
CREATE TABLE IF NOT EXISTS villages (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    panchayat_code TEXT UNIQUE,
    boundary GEOMETRY(POLYGON, 4326)
);

-- Wards within a village
CREATE TABLE IF NOT EXISTS wards (
    id SERIAL PRIMARY KEY,
    village_id INTEGER REFERENCES villages(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    boundary GEOMETRY(POLYGON, 4326)
);

-- Geotagged infrastructure assets
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ward_id INTEGER REFERENCES wards(id) ON DELETE SET NULL,
    asset_type TEXT NOT NULL CHECK (asset_type IN (
        'road','handpump','overhead_tank','public_toilet','school',
        'anganwadi','phc','streetlight','drainage','ration_shop'
    )),
    name TEXT,
    status TEXT DEFAULT 'active',
    location GEOMETRY(POINT, 4326) NOT NULL,
    attributes JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_location ON assets USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets (asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_ward_id ON assets (ward_id);

-- Citizen grievance / issue reports
CREATE TABLE IF NOT EXISTS issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    ward_id INTEGER REFERENCES wards(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('low','medium','high','critical')) DEFAULT 'medium',
    description TEXT,
    photo_url TEXT,
    photos JSONB DEFAULT '[]',
    gps_accuracy_m REAL,
    heading_deg REAL,
    location_source TEXT DEFAULT 'gps',
    resolution_photo_url TEXT,
    resolution_photo_meta JSONB,
    location GEOMETRY(POINT, 4326) NOT NULL,
    status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
    reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_officer TEXT,
    date_reported TIMESTAMP DEFAULT now(),
    date_resolved TIMESTAMP,
    updated_at TIMESTAMP DEFAULT now()
);

-- Idempotent media & GPS telemetry columns for existing deployments
ALTER TABLE issues ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]';
ALTER TABLE issues ADD COLUMN IF NOT EXISTS gps_accuracy_m REAL;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS heading_deg REAL;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS location_source TEXT DEFAULT 'gps';
ALTER TABLE issues ADD COLUMN IF NOT EXISTS resolution_photo_url TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS resolution_photo_meta JSONB;

CREATE INDEX IF NOT EXISTS idx_issues_location ON issues USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_issues_ward_id ON issues (ward_id);
CREATE INDEX IF NOT EXISTS idx_issues_ward_status ON issues (ward_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_reported_by ON issues (reported_by);

-- Generated PDF reports
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    ward_id INTEGER REFERENCES wards(id) ON DELETE SET NULL,
    generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    report_type TEXT,
    file_url TEXT,
    created_at TIMESTAMP DEFAULT now()
);

-- Seed default village and ward
INSERT INTO villages (name, panchayat_code)
VALUES ('Shivpur', 'GP-SHIVPUR-001')
ON CONFLICT (panchayat_code) DO NOTHING;

INSERT INTO wards (village_id, name)
SELECT 1, 'Ward 3 - Kalyanpur'
WHERE NOT EXISTS (SELECT 1 FROM wards WHERE village_id = 1 AND name = 'Ward 3 - Kalyanpur');


-- Auto-update updated_at timestamp trigger
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assets_updated_at ON assets;
CREATE TRIGGER trg_assets_updated_at
BEFORE UPDATE ON assets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_issues_updated_at ON issues;
CREATE TRIGGER trg_issues_updated_at
BEFORE UPDATE ON issues
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
