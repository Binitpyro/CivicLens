-- CivicLens complete Supabase/PostGIS setup
-- Run this once in Supabase Dashboard -> SQL Editor.
-- Uses the public schema and works with the Node/pg API in api/src/config/db.ts.

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.villages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  panchayat_code TEXT UNIQUE,
  lbd_code TEXT UNIQUE,
  boundary geometry(Polygon, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wards (
  id SERIAL PRIMARY KEY,
  village_id INTEGER REFERENCES public.villages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lbd_code TEXT,
  boundary geometry(Polygon, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (village_id, name)
);

CREATE TABLE IF NOT EXISTS public.users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('admin', 'citizen', 'volunteer', 'surveyor', 'viewer', 'panchayat_officer')),
  ward_id INTEGER REFERENCES public.wards(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assets (
  id VARCHAR(64) PRIMARY KEY,
  ward_id INTEGER REFERENCES public.wards(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL
    CHECK (asset_type IN (
      'road', 'handpump', 'overhead_tank', 'public_toilet', 'school',
      'anganwadi', 'phc', 'streetlight', 'drainage', 'ration_shop'
    )),
  name TEXT,
  lbd_asset_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'non_functional', 'under_construction')),
  location geometry(Point, 4326) NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  version_id INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.issues (
  id VARCHAR(64) PRIMARY KEY,
  asset_id VARCHAR(64) REFERENCES public.assets(id) ON DELETE SET NULL,
  ward_id INTEGER REFERENCES public.wards(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT,
  photo_url TEXT,
  encrypted_phone TEXT,
  location geometry(Point, 4326) NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved')),
  reported_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_officer TEXT,
  version_id INTEGER NOT NULL DEFAULT 1,
  client_seq_num BIGINT NOT NULL DEFAULT 1,
  server_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_reported TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_resolved TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reports (
  id SERIAL PRIMARY KEY,
  ward_id INTEGER REFERENCES public.wards(id) ON DELETE SET NULL,
  generated_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL DEFAULT 'gram_sabha',
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.spatial_grid_summary (
  id SERIAL PRIMARY KEY,
  ward_id INTEGER REFERENCES public.wards(id) ON DELETE CASCADE,
  cell_geohash TEXT NOT NULL,
  category TEXT NOT NULL,
  issue_count INTEGER NOT NULL DEFAULT 0,
  centroid geometry(Point, 4326),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ward_id, cell_geohash, category)
);

CREATE TABLE IF NOT EXISTS public.sync_conflicts (
  id SERIAL PRIMARY KEY,
  record_id VARCHAR(64) NOT NULL,
  table_name TEXT NOT NULL
    CHECK (table_name IN ('assets', 'issues')),
  client_payload JSONB NOT NULL,
  server_state JSONB NOT NULL,
  conflict_reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_location ON public.assets USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_assets_ward_id ON public.assets (ward_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON public.assets (asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_status ON public.assets (status);

CREATE INDEX IF NOT EXISTS idx_issues_location ON public.issues USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_issues_ward_id ON public.issues (ward_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON public.issues (status);
CREATE INDEX IF NOT EXISTS idx_issues_category ON public.issues (category);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON public.issues (severity);
CREATE INDEX IF NOT EXISTS idx_issues_ward_status ON public.issues (ward_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_reported_by ON public.issues (reported_by);
CREATE INDEX IF NOT EXISTS idx_issues_asset_id ON public.issues (asset_id);

CREATE INDEX IF NOT EXISTS idx_spatial_grid_ward ON public.spatial_grid_summary (ward_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_record ON public.sync_conflicts (record_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status ON public.sync_conflicts (status);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_users_updated_at ON public.users;
CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_assets_updated_at ON public.assets;
CREATE TRIGGER set_assets_updated_at
BEFORE UPDATE ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_issues_updated_at ON public.issues;
CREATE TRIGGER set_issues_updated_at
BEFORE UPDATE ON public.issues
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The API owns authentication and authorization through JWTs.
-- Direct public/Supabase access should remain protected by RLS.
ALTER TABLE public.villages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spatial_grid_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;

-- If Supabase anon or PostgREST access is ever enabled, add deliberate
-- per-table RLS policies. Keep this disabled for direct API database access.

INSERT INTO public.villages (id, name, panchayat_code, lbd_code)
VALUES (1, 'Shivpur Gram Panchayat', 'GP-248192', 'LBD-VIL-94182')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  panchayat_code = EXCLUDED.panchayat_code,
  lbd_code = EXCLUDED.lbd_code;

INSERT INTO public.wards (id, village_id, name, lbd_code)
VALUES (1, 1, 'Ward 3 (Kalyanpur)', 'LBD-WRD-003')
ON CONFLICT (id) DO UPDATE SET
  village_id = EXCLUDED.village_id,
  name = EXCLUDED.name,
  lbd_code = EXCLUDED.lbd_code;

-- Pilot admin: phone 9876543210, password admin123
INSERT INTO public.users (id, name, phone, password_hash, role, ward_id)
VALUES (
  1,
  'Rajesh Kumar (Secretary)',
  '9876543210',
  '$2b$10$4yWdmu9Gx.3Aid4Tk60D5.wL3mxW4BJuGCIpSXw8tWcG5Wj0Y40Dy',
  'admin',
  1
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  ward_id = EXCLUDED.ward_id;

INSERT INTO public.assets (
  id, ward_id, asset_type, name, lbd_asset_id, status, location, attributes
) VALUES
  ('a1000000-0000-0000-0000-000000000001', 1, 'handpump', 'Main Chowk Handpump', 'HP-001', 'active', ST_SetSRID(ST_MakePoint(77.2090, 28.6139), 4326), '{"handpump_type":"India Mark II","depth_ft":180}'::jsonb),
  ('a1000000-0000-0000-0000-000000000002', 1, 'handpump', 'School Badi Handpump', 'HP-002', 'non_functional', ST_SetSRID(ST_MakePoint(77.2115, 28.6152), 4326), '{"handpump_type":"India Mark III","depth_ft":150}'::jsonb),
  ('a1000000-0000-0000-0000-000000000003', 1, 'school', 'Government Primary School Ward 3', 'SCH-108', 'active', ST_SetSRID(ST_MakePoint(77.2120, 28.6155), 4326), '{"grades":"1-5","students":140}'::jsonb),
  ('a1000000-0000-0000-0000-000000000004', 1, 'anganwadi', 'Anganwadi Center Kalyanpur', 'ANG-04', 'active', ST_SetSRID(ST_MakePoint(77.2085, 28.6128), 4326), '{"worker":"Sunita Devi"}'::jsonb),
  ('a1000000-0000-0000-0000-000000000005', 1, 'streetlight', 'Temple Junction Streetlight', 'SL-401', 'non_functional', ST_SetSRID(ST_MakePoint(77.2102, 28.6145), 4326), '{"type":"Solar LED"}'::jsonb),
  ('a1000000-0000-0000-0000-000000000006', 1, 'drainage', 'East Hamlet Main Drain', 'DRN-12', 'active', ST_SetSRID(ST_MakePoint(77.2095, 28.6132), 4326), '{"type":"Open Concrete"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  ward_id = EXCLUDED.ward_id,
  asset_type = EXCLUDED.asset_type,
  name = EXCLUDED.name,
  lbd_asset_id = EXCLUDED.lbd_asset_id,
  status = EXCLUDED.status,
  location = EXCLUDED.location,
  attributes = EXCLUDED.attributes,
  updated_at = now();

INSERT INTO public.issues (
  id, asset_id, ward_id, category, severity, description, location,
  status, reported_by, client_seq_num
) VALUES
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 1, 'Water Supply', 'high', 'Handpump handle broken and water smells foul', ST_SetSRID(ST_MakePoint(77.2115, 28.6152), 4326), 'open', 1, 1),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000005', 1, 'Street Lighting', 'medium', 'Solar battery dead, street completely dark at night', ST_SetSRID(ST_MakePoint(77.2102, 28.6145), 4326), 'in_progress', 1, 2),
  ('b2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000006', 1, 'Drainage', 'critical', 'Drain blocked by plastic waste causing overflow near school', ST_SetSRID(ST_MakePoint(77.2095, 28.6132), 4326), 'open', 1, 3)
ON CONFLICT (id) DO UPDATE SET
  asset_id = EXCLUDED.asset_id,
  ward_id = EXCLUDED.ward_id,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  description = EXCLUDED.description,
  location = EXCLUDED.location,
  status = EXCLUDED.status,
  reported_by = EXCLUDED.reported_by,
  client_seq_num = EXCLUDED.client_seq_num,
  updated_at = now();

SELECT setval(pg_get_serial_sequence('public.villages', 'id'), GREATEST(COALESCE(MAX(id), 1), 1), true) FROM public.villages;
SELECT setval(pg_get_serial_sequence('public.wards', 'id'), GREATEST(COALESCE(MAX(id), 1), 1), true) FROM public.wards;
SELECT setval(pg_get_serial_sequence('public.users', 'id'), GREATEST(COALESCE(MAX(id), 1), 1), true) FROM public.users;

COMMIT;
