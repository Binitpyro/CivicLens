-- PostGIS Database Schema for CivicLens
CREATE EXTENSION IF NOT EXISTS postgis;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin','surveyor','viewer','panchayat_officer')) DEFAULT 'viewer',
  ward_id INTEGER,
  created_at TIMESTAMP DEFAULT now()
);

-- Villages table (with Government Local Body Directory LBD code support)
CREATE TABLE IF NOT EXISTS villages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  panchayat_code TEXT, -- eGramSwaraj Gram Panchayat Code
  lbd_code TEXT UNIQUE, -- Government LBD Code
  boundary GEOMETRY(POLYGON, 4326)
);

-- Wards table
CREATE TABLE IF NOT EXISTS wards (
  id SERIAL PRIMARY KEY,
  village_id INTEGER REFERENCES villages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lbd_code TEXT, -- Ward LBD Code
  boundary GEOMETRY(POLYGON, 4326)
);

-- Infrastructure Assets table
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY,
  ward_id INTEGER REFERENCES wards(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN (
    'road','handpump','overhead_tank','public_toilet','school',
    'anganwadi','phc','streetlight','drainage','ration_shop'
  )),
  name TEXT,
  lbd_asset_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'non_functional', 'under_construction')),
  location GEOMETRY(POINT, 4326) NOT NULL,
  attributes JSONB DEFAULT '{}',
  version_id INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assets_location ON assets USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets (asset_type);

-- Grievances & Issues table
CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY,
  asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  ward_id INTEGER REFERENCES wards(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low','medium','high','critical')) DEFAULT 'medium',
  description TEXT,
  photo_url TEXT,
  encrypted_phone TEXT,
  location GEOMETRY(POINT, 4326) NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_officer TEXT,
  version_id INTEGER DEFAULT 1,
  client_seq_num BIGINT NOT NULL DEFAULT 1,
  server_received_at TIMESTAMP DEFAULT now(),
  date_reported TIMESTAMP DEFAULT now(),
  date_resolved TIMESTAMP,
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issues_location ON issues USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues (status);
CREATE INDEX IF NOT EXISTS idx_issues_category ON issues (category);

-- Pre-aggregated spatial summary grid table (avoids dynamic ST_ClusterKMeans CPU spikes)
CREATE TABLE IF NOT EXISTS spatial_grid_summary (
  id SERIAL PRIMARY KEY,
  ward_id INTEGER REFERENCES wards(id) ON DELETE CASCADE,
  cell_geohash TEXT NOT NULL,
  category TEXT NOT NULL,
  issue_count INTEGER DEFAULT 0,
  centroid GEOMETRY(POINT, 4326),
  last_updated TIMESTAMP DEFAULT now()
);

-- Sync conflicts arbitration table
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id SERIAL PRIMARY KEY,
  record_id UUID NOT NULL,
  table_name TEXT NOT NULL,
  client_payload JSONB NOT NULL,
  server_state JSONB NOT NULL,
  conflict_reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
  created_at TIMESTAMP DEFAULT now()
);
