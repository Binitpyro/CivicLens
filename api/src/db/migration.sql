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

-- Geotagged infrastructure assets (supports prefixed and UUID string IDs)
CREATE TABLE IF NOT EXISTS assets (
    id VARCHAR(64) PRIMARY KEY,
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
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64) REFERENCES assets(id) ON DELETE SET NULL,
    ward_id INTEGER REFERENCES wards(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('low','medium','high','critical')) DEFAULT 'medium',
    description TEXT,
    photo_url TEXT,
    location GEOMETRY(POINT, 4326) NOT NULL,
    status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
    reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_officer TEXT,
    date_reported TIMESTAMP DEFAULT now(),
    date_resolved TIMESTAMP,
    updated_at TIMESTAMP DEFAULT now()
);

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

-- Idempotent conversion from UUID to VARCHAR(64) for existing tables
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets' AND column_name = 'id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_asset_id_fkey;
    ALTER TABLE assets ALTER COLUMN id TYPE VARCHAR(64) USING id::text;
    ALTER TABLE issues ALTER COLUMN id TYPE VARCHAR(64) USING id::text;
    ALTER TABLE issues ALTER COLUMN asset_id TYPE VARCHAR(64) USING asset_id::text;
    ALTER TABLE issues ADD CONSTRAINT issues_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL;
  END IF;
END $$;

