-- ============================================================================
-- CivicLens Pillar 2: Advanced GIS & Spatial Intelligence Schema
-- PostGIS Migration for Deduplication, Corroborations, Drainage, Elevation & Monsoon Vulnerability
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ----------------------------------------------------------------------------
-- 1. Schema Enhancements to Existing 'issues' Table
-- ----------------------------------------------------------------------------
ALTER TABLE issues 
  ADD COLUMN IF NOT EXISTS corroboration_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS photo_phash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS last_corroborated_at TIMESTAMP DEFAULT now(),
  ADD COLUMN IF NOT EXISTS auto_severity_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS ai_detected_category TEXT,
  ADD COLUMN IF NOT EXISTS priority_score NUMERIC(5,2) DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS near_vital_asset BOOLEAN DEFAULT FALSE;

-- Optimized functional GiST index for ST_DWithin(location::geography, ...)
-- This avoids full table scans when checking 30m proximity in meter units
CREATE INDEX IF NOT EXISTS idx_issues_location_geog 
  ON issues USING GIST ((location::geography));

-- Partial GiST index: Only index active issues (open/in_progress) for deduplication
-- High performance optimization: skips thousands of closed/resolved historic records
CREATE INDEX IF NOT EXISTS idx_issues_active_location_geog 
  ON issues USING GIST ((location::geography)) 
  WHERE status IN ('open', 'in_progress');

-- Index on photo perceptual hash for image duplicate detection
CREATE INDEX IF NOT EXISTS idx_issues_photo_phash 
  ON issues (photo_phash) 
  WHERE photo_phash IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 2. Community Corroborations & Upvoting Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issue_corroborations (
  id SERIAL PRIMARY KEY,
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  device_fingerprint TEXT, -- PWA browser fingerprint for anonymous village residents
  action_type VARCHAR(30) NOT NULL DEFAULT 'upvote' 
    CHECK (action_type IN ('upvote', 'corroborate_still_present', 'severity_worsened', 'fixed_by_community')),
  notes TEXT,
  photo_url TEXT,
  location GEOMETRY(POINT, 4326) NOT NULL,
  distance_meters NUMERIC(6,2),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_corroborations_issue_id 
  ON issue_corroborations (issue_id);

CREATE INDEX IF NOT EXISTS idx_issue_corroborations_created_at 
  ON issue_corroborations (created_at);

-- Prevent multiple upvotes from the same logged-in user on the same issue
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_issue_upvote 
  ON issue_corroborations (issue_id, user_id) 
  WHERE user_id IS NOT NULL;

-- Prevent spamming from the same anonymous device within the same calendar day
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_device_daily_upvote 
  ON issue_corroborations (issue_id, device_fingerprint, (date_trunc('day', created_at))) 
  WHERE device_fingerprint IS NOT NULL AND user_id IS NULL;


-- ----------------------------------------------------------------------------
-- 3. Drainage Network Lines (Pillar 2 Monsoon Analysis)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drainage_lines (
  id SERIAL PRIMARY KEY,
  ward_id INTEGER REFERENCES wards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  drain_type TEXT NOT NULL CHECK (drain_type IN ('pucca_concrete', 'kuccha_unpaved', 'natural_nalla', 'culvert')),
  condition TEXT NOT NULL DEFAULT 'clear' CHECK (condition IN ('clear', 'partially_silted', 'severely_choked', 'damaged')),
  width_meters NUMERIC(4,2) DEFAULT 1.0,
  depth_meters NUMERIC(4,2) DEFAULT 0.8,
  flow_direction_deg NUMERIC(5,2),
  geom GEOMETRY(LINESTRING, 4326) NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drainage_lines_geom 
  ON drainage_lines USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_drainage_lines_geom_geog 
  ON drainage_lines USING GIST ((geom::geography));

CREATE INDEX IF NOT EXISTS idx_drainage_ward_condition 
  ON drainage_lines (ward_id, condition);


-- ----------------------------------------------------------------------------
-- 4. Topographic Depressions & Elevation Grid (Monsoon Vulnerability)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS topographic_depressions (
  id SERIAL PRIMARY KEY,
  ward_id INTEGER REFERENCES wards(id) ON DELETE CASCADE,
  name TEXT,
  relative_depression_depth_m NUMERIC(5,2) NOT NULL DEFAULT 0.5, -- Depth relative to surrounding buffer
  soil_type TEXT NOT NULL DEFAULT 'alluvial_loam' 
    CHECK (soil_type IN ('clayey_black_cotton', 'alluvial_loam', 'sandy_porous', 'impermeable_paved')),
  catchment_area_sqm NUMERIC(10,2),
  geom GEOMETRY(POLYGON, 4326) NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topographic_depressions_geom 
  ON topographic_depressions USING GIST (geom);


-- ----------------------------------------------------------------------------
-- 5. Stored Database Functions for Spatial Intelligence
-- ----------------------------------------------------------------------------

-- Function: Find duplicate/nearby open issues within a given radius (meters)
CREATE OR REPLACE FUNCTION fn_find_duplicate_issues(
  p_lng DOUBLE PRECISION,
  p_lat DOUBLE PRECISION,
  p_category TEXT DEFAULT NULL,
  p_radius_meters DOUBLE PRECISION DEFAULT 30.0,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  severity TEXT,
  description TEXT,
  photo_url TEXT,
  status TEXT,
  corroboration_count INTEGER,
  priority_score NUMERIC,
  date_reported TIMESTAMP,
  distance_meters NUMERIC,
  bearing_degrees NUMERIC,
  category_match_score NUMERIC,
  geometry JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.category,
    i.severity,
    i.description,
    i.photo_url,
    i.status,
    i.corroboration_count,
    i.priority_score,
    i.date_reported,
    ROUND(ST_Distance(i.location::geography, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)::numeric, 2) AS distance_meters,
    CASE 
      WHEN ST_DWithin(i.location::geography, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, 1.0) THEN NULL
      ELSE ROUND((DEGREES(ST_Azimuth(ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326), i.location)))::numeric, 1)
    END AS bearing_degrees,
    CASE 
      WHEN p_category IS NOT NULL AND LOWER(i.category) = LOWER(p_category) THEN 1.00
      WHEN p_category IS NOT NULL AND i.category ILIKE ('%' || p_category || '%') THEN 0.80
      ELSE 0.50
    END AS category_match_score,
    ST_AsGeoJSON(i.location)::json AS geometry
  FROM issues i
  WHERE i.status IN ('open', 'in_progress')
    AND ST_DWithin(i.location::geography, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_meters)
  ORDER BY category_match_score DESC, distance_meters ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;


-- Function: Recalculate issue priority score based on upvotes, severity, and cached civic asset proximity
CREATE OR REPLACE FUNCTION fn_recalculate_issue_priority(p_issue_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_severity TEXT;
  v_upvotes INTEGER;
  v_category TEXT;
  v_near_vital_asset BOOLEAN;
  v_base_score NUMERIC := 30.0;
  v_upvote_bonus NUMERIC := 0.0;
  v_proximity_bonus NUMERIC := 0.0;
  v_final_priority NUMERIC;
BEGIN
  -- Read issue state including cached near_vital_asset flag (avoids expensive spatial join on every upvote!)
  SELECT severity, corroboration_count, category, COALESCE(near_vital_asset, FALSE)
  INTO v_severity, v_upvotes, v_category, v_near_vital_asset
  FROM issues
  WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RETURN 0.0;
  END IF;

  -- Base severity weight
  CASE v_severity
    WHEN 'critical' THEN v_base_score := 75.0;
    WHEN 'high'     THEN v_base_score := 55.0;
    WHEN 'medium'   THEN v_base_score := 35.0;
    ELSE                 v_base_score := 15.0;
  END CASE;

  -- Community corroboration logarithmic scaling: min(25, log2(upvotes + 1) * 5)
  v_upvote_bonus := LEAST(25.0, (LN(GREATEST(1, v_upvotes) + 1.0) / LN(2.0)) * 5.0);

  -- Cached proximity bonus (15 points for schools, PHCs, Anganwadis, drinking water points)
  IF v_near_vital_asset THEN
    v_proximity_bonus := 15.0;
  END IF;

  v_final_priority := LEAST(100.0, ROUND((v_base_score + v_upvote_bonus + v_proximity_bonus)::numeric, 2));

  UPDATE issues 
  SET priority_score = v_final_priority,
      updated_at = now()
  WHERE id = p_issue_id;

  RETURN v_final_priority;
END;
$$ LANGUAGE plpgsql VOLATILE;
