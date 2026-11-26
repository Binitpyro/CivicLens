import { pool } from '../config/db';

export interface DuplicateIssueMatch {
  id: string;
  category: string;
  severity: string;
  description: string;
  photo_url: string | null;
  status: string;
  corroboration_count: number;
  priority_score: number;
  date_reported: string;
  distance_meters: number;
  bearing_degrees: number | null;
  category_match_score: number;
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

export interface CheckDuplicatesParams {
  latitude: number;
  longitude: number;
  category?: string;
  radius_meters?: number;
  limit?: number;
}

export interface CorroborateParams {
  issue_id: string;
  user_id?: number | null;
  device_fingerprint?: string | null;
  action_type?: 'upvote' | 'corroborate_still_present' | 'severity_worsened' | 'fixed_by_community';
  notes?: string | null;
  photo_url?: string | null;
  latitude: number;
  longitude: number;
}

/**
 * Pure helper: Computes Haversine distance in meters between two lat/lng points
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Pure helper: Computes bearing in degrees (0-360) from point 1 to point 2
 * Collocation Guard: If distance < 1m, returns null (user is at exact location)
 */
export function calculateBearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number | null {
  const dist = haversineDistanceMeters(lat1, lon1, lat2, lon2);
  if (dist < 1.0) {
    return null;
  }

  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  const bearing = ((theta * 180) / Math.PI + 360) % 360;
  return Math.round(bearing * 10) / 10;
}

/**
 * Pure helper: Calculates the composite priority score for an issue
 */
export function calculatePriorityScore(
  severity: string,
  corroborationCount: number,
  hasNearbyVulnerableAsset: boolean = false
): number {
  let baseScore = 35.0;
  switch (severity.toLowerCase()) {
    case 'critical':
      baseScore = 75.0;
      break;
    case 'high':
      baseScore = 55.0;
      break;
    case 'medium':
      baseScore = 35.0;
      break;
    case 'low':
      baseScore = 15.0;
      break;
  }

  // Upvotes boost priority via logarithmic growth (capped at 25 points)
  const upvoteBonus = Math.min(25.0, (Math.log2(Math.max(1, corroborationCount) + 1)) * 5.0);

  // Proximity to essential community asset (school, PHC, water source) adds 15 points
  const proximityBonus = hasNearbyVulnerableAsset ? 15.0 : 0.0;

  return Math.min(100.0, Math.round((baseScore + upvoteBonus + proximityBonus) * 100) / 100);
}

/**
 * Service: Check for duplicate open issues within radius (meters) using PostGIS ST_DWithin
 */
export async function findDuplicateIssues(
  params: CheckDuplicatesParams
): Promise<DuplicateIssueMatch[]> {
  const {
    latitude,
    longitude,
    category,
    radius_meters = 30.0,
    limit = 5,
  } = params;

  const query = `
    SELECT 
      i.id,
      i.category,
      i.severity,
      i.description,
      i.photo_url,
      i.status,
      COALESCE(i.corroboration_count, 1) AS corroboration_count,
      COALESCE(i.priority_score, 50.0) AS priority_score,
      i.date_reported,
      ROUND(ST_Distance(i.location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)::numeric, 2) AS distance_meters,
      CASE 
        WHEN ST_DWithin(i.location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 1.0) THEN NULL
        ELSE ROUND((DEGREES(ST_Azimuth(ST_SetSRID(ST_MakePoint($1, $2), 4326), i.location)))::numeric, 1)
      END AS bearing_degrees,
      CASE 
        WHEN $3::text IS NOT NULL AND LOWER(i.category) = LOWER($3::text) THEN 1.00
        WHEN $3::text IS NOT NULL AND i.category ILIKE ('%' || $3::text || '%') THEN 0.80
        ELSE 0.50
      END AS category_match_score,
      ST_AsGeoJSON(i.location)::json AS geometry
    FROM issues i
    WHERE i.status IN ('open', 'in_progress')
      AND ST_DWithin(i.location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $4)
    ORDER BY category_match_score DESC, distance_meters ASC
    LIMIT $5;
  `;

  const result = await pool.query(query, [
    longitude,
    latitude,
    category || null,
    radius_meters,
    limit,
  ]);

  return result.rows.map((row) => ({
    id: row.id,
    category: row.category,
    severity: row.severity,
    description: row.description,
    photo_url: row.photo_url,
    status: row.status,
    corroboration_count: Number(row.corroboration_count),
    priority_score: Number(row.priority_score),
    date_reported: row.date_reported,
    distance_meters: Number(row.distance_meters),
    bearing_degrees: row.bearing_degrees != null ? Number(row.bearing_degrees) : null,
    category_match_score: Number(row.category_match_score),
    geometry: row.geometry,
  }));
}

/**
 * Service: Corroborate / Upvote an existing issue (1-tap action)
 */
export async function corroborateIssue(params: CorroborateParams): Promise<{
  success: boolean;
  corroboration_id: number;
  issue_id: string;
  new_corroboration_count: number;
  new_priority_score: number;
  new_severity?: string;
}> {
  const {
    issue_id,
    user_id = null,
    device_fingerprint = null,
    action_type = 'upvote',
    notes = null,
    photo_url = null,
    latitude,
    longitude,
  } = params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify issue exists and is open (reads cached near_vital_asset to avoid runtime spatial joins)
    const issueRes = await client.query(
      `SELECT id, status, severity, corroboration_count, location, COALESCE(near_vital_asset, FALSE) AS near_vital_asset,
              ROUND(ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)::numeric, 2) AS distance_meters
       FROM issues 
       WHERE id = $3`,
      [longitude, latitude, issue_id]
    );

    if (issueRes.rows.length === 0) {
      throw new Error(`Issue ${issue_id} not found`);
    }

    const issue = issueRes.rows[0];
    if (issue.status === 'resolved') {
      throw new Error(`Cannot corroborate an already resolved issue`);
    }

    const distanceMeters = Number(issue.distance_meters);

    // 2. Anti-fraud check: Check if user or device has already corroborated this issue
    if (user_id) {
      const existingUserCheck = await client.query(
        `SELECT id FROM issue_corroborations WHERE issue_id = $1 AND user_id = $2`,
        [issue_id, user_id]
      );
      if (existingUserCheck.rows.length > 0) {
        throw new Error(`User has already corroborated this issue`);
      }
    } else if (device_fingerprint) {
      const existingDeviceCheck = await client.query(
        `SELECT id FROM issue_corroborations 
         WHERE issue_id = $1 AND device_fingerprint = $2 
           AND created_at >= now() - INTERVAL '24 hours'`,
        [issue_id, device_fingerprint]
      );
      if (existingDeviceCheck.rows.length > 0) {
        throw new Error(`This device has already corroborated this issue within the past 24 hours`);
      }
    }

    // 3. Record corroboration entry
    const insertRes = await client.query(
      `INSERT INTO issue_corroborations (
         issue_id, user_id, device_fingerprint, action_type, notes, photo_url, location, distance_meters
       )
       VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9)
       RETURNING id`,
      [
        issue_id,
        user_id,
        device_fingerprint,
        action_type,
        notes,
        photo_url,
        longitude,
        latitude,
        distanceMeters,
      ]
    );

    const corroborationId = insertRes.rows[0].id;

    // 4. Update corroboration count on issue
    const newCount = Number(issue.corroboration_count) + 1;

    // If action_type is severity_worsened and upvotes >= 3, escalate severity if not already critical
    let updatedSeverity = issue.severity;
    if (action_type === 'severity_worsened') {
      if (issue.severity === 'low') updatedSeverity = 'medium';
      else if (issue.severity === 'medium') updatedSeverity = 'high';
      else if (issue.severity === 'high' && newCount >= 3) updatedSeverity = 'critical';
    }

    // 5. Use cached vital asset proximity flag for fast priority scoring (0 runtime joins)
    const hasVulnerableAsset = Boolean(issue.near_vital_asset);

    const newPriorityScore = calculatePriorityScore(updatedSeverity, newCount, hasVulnerableAsset);

    await client.query(
      `UPDATE issues 
       SET corroboration_count = $1,
           severity = $2,
           priority_score = $3,
           last_corroborated_at = now(),
           updated_at = now()
       WHERE id = $4`,
      [newCount, updatedSeverity, newPriorityScore, issue_id]
    );

    await client.query('COMMIT');

    return {
      success: true,
      corroboration_id: corroborationId,
      issue_id,
      new_corroboration_count: newCount,
      new_priority_score: newPriorityScore,
      new_severity: updatedSeverity,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
