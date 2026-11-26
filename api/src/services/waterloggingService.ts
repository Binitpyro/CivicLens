import { pool } from '../config/db';

export interface MonsoonVulnerabilityHotspot {
  id: string;
  ward_id: number;
  risk_level: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  vsi_score: number; // Vulnerability Scoring Index: 0 to 100
  depression_depth_m: number;
  nearest_drain_id: number | null;
  nearest_drain_distance_m: number;
  nearest_drain_condition: string;
  affected_assets_count: number;
  affected_assets_summary: Array<{ id: string; name: string; asset_type: string }>;
  recommended_action: string;
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

export interface CalculateVsiParams {
  relativeDepressionDepthM: number;
  nearestDrainDistanceM: number;
  drainCondition: 'clear' | 'partially_silted' | 'severely_choked' | 'damaged' | 'no_drain';
  soilType: 'clayey_black_cotton' | 'alluvial_loam' | 'sandy_porous' | 'impermeable_paved';
  historicalWaterloggingIssueCount: number;
}

/**
 * Pure helper: Computes Multi-Criteria Vulnerability Scoring Index (VSI) in [0, 100]
 */
export function calculateVulnerabilityScoringIndex(params: CalculateVsiParams): {
  vsiScore: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  recommendedAction: string;
} {
  const {
    relativeDepressionDepthM,
    nearestDrainDistanceM,
    drainCondition,
    soilType,
    historicalWaterloggingIssueCount,
  } = params;

  // 1. Topographic Depression Factor (Weight: 35%)
  // Deeper depressions collect runoff water rapidly
  let sDepression = 20.0;
  if (relativeDepressionDepthM >= 1.0) {
    sDepression = 100.0;
  } else if (relativeDepressionDepthM >= 0.5) {
    sDepression = 75.0;
  } else if (relativeDepressionDepthM >= 0.2) {
    sDepression = 50.0;
  }

  // 2. Drainage Deficit & Choke Factor (Weight: 30%)
  let sDrain = 20.0;
  if (drainCondition === 'no_drain' || nearestDrainDistanceM > 150) {
    sDrain = 90.0; // Severe drainage void
  } else if (drainCondition === 'severely_choked' || drainCondition === 'damaged') {
    sDrain = 95.0; // Severe backflow and overflow hazard
  } else if (drainCondition === 'partially_silted') {
    sDrain = 65.0;
  } else if (nearestDrainDistanceM > 50) {
    sDrain = 45.0;
  } else {
    sDrain = 15.0; // Functioning drain within 50m
  }

  // 3. Soil Permeability & Runoff Factor (Weight: 15%)
  let sSoil = 40.0;
  switch (soilType) {
    case 'impermeable_paved':
      sSoil = 90.0;
      break;
    case 'clayey_black_cotton':
      sSoil = 80.0; // Holds water, swells, poor percolation
      break;
    case 'alluvial_loam':
      sSoil = 45.0;
      break;
    case 'sandy_porous':
      sSoil = 20.0; // Rapid natural drainage
      break;
  }

  // 4. Historical Issue Recurrence Factor (Weight: 20%)
  const sHist = Math.min(100.0, historicalWaterloggingIssueCount * 25.0);

  // Composite Weighted Sum
  const rawVsi = (sDepression * 0.35) + (sDrain * 0.30) + (sSoil * 0.15) + (sHist * 0.20);
  const vsiScore = Math.min(100, Math.max(0, Math.round(rawVsi * 10) / 10));

  let riskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' = 'LOW';
  let recommendedAction = 'Maintain routine seasonal inspection.';

  if (vsiScore >= 75) {
    riskLevel = 'CRITICAL';
    recommendedAction = drainCondition === 'severely_choked' || drainCondition === 'partially_silted'
      ? 'EMERGENCY: Desilt clogged drainage line before monsoon onset; construct temporary earthen diversion bund.'
      : 'EMERGENCY: Deploy mobile sump pump; elevate handpump plinths and install sandbag barriers around schools/PHCs.';
  } else if (vsiScore >= 55) {
    riskLevel = 'HIGH';
    recommendedAction = 'Clear silt from roadside drains and excavate percolation trenches to channel stormwater away from village paths.';
  } else if (vsiScore >= 35) {
    riskLevel = 'MODERATE';
    recommendedAction = 'Inspect culverts and remove accumulated plastic/solid waste debris.';
  }

  return { vsiScore, riskLevel, recommendedAction };
}

/**
 * Service: Executes PostGIS spatial query combining drainage lines, topographic depressions, 
 * and nearby assets to identify high-risk monsoon waterlogging hotspots.
 */
export async function getMonsoonWaterloggingAnalysis(
  wardId: number,
  minRiskLevel?: string
): Promise<{
  ward_id: number;
  total_hotspots: number;
  critical_hotspots: number;
  features: any[];
}> {
  // PostGIS spatial query combining topographic depressions, drainage lines, and assets
  const query = `
    WITH depression_drainage AS (
      SELECT 
        td.id AS depression_id,
        td.ward_id,
        td.relative_depression_depth_m,
        td.soil_type,
        td.geom AS depression_geom,
        -- Find nearest drainage line
        dl.id AS nearest_drain_id,
        dl.name AS drain_name,
        dl.condition AS drain_condition,
        ROUND(COALESCE(ST_Distance(td.geom::geography, dl.geom::geography), 999.0)::numeric, 1) AS drain_distance_m
      FROM topographic_depressions td
      LEFT JOIN LATERAL (
        SELECT id, name, condition, geom
        FROM drainage_lines
        WHERE ward_id = td.ward_id
        ORDER BY td.geom <-> geom
        LIMIT 1
      ) dl ON TRUE
      WHERE td.ward_id = $1
    ),
    depression_issues AS (
      SELECT 
        dd.depression_id,
        COUNT(i.id) AS waterlogging_issue_count
      FROM depression_drainage dd
      LEFT JOIN issues i 
        ON ST_DWithin(dd.depression_geom::geography, i.location::geography, 30.0)
        AND (i.category ILIKE '%water%' OR i.category ILIKE '%drain%' OR i.category ILIKE '%flood%')
      GROUP BY dd.depression_id
    ),
    depression_assets AS (
      SELECT 
        dd.depression_id,
        COUNT(a.id) AS asset_count,
        COALESCE(
          json_agg(
            json_build_object('id', a.id, 'name', a.name, 'asset_type', a.asset_type)
          ) FILTER (WHERE a.id IS NOT NULL), 
          '[]'::json
        ) AS affected_assets
      FROM depression_drainage dd
      LEFT JOIN assets a 
        ON ST_Intersects(dd.depression_geom, a.location)
      GROUP BY dd.depression_id
    )
    SELECT 
      dd.depression_id,
      dd.ward_id,
      dd.relative_depression_depth_m,
      dd.soil_type,
      dd.nearest_drain_id,
      dd.drain_name,
      COALESCE(dd.drain_condition, 'no_drain') AS drain_condition,
      dd.drain_distance_m,
      COALESCE(di.waterlogging_issue_count, 0) AS waterlogging_issue_count,
      COALESCE(da.asset_count, 0) AS asset_count,
      da.affected_assets,
      ST_AsGeoJSON(dd.depression_geom)::json AS geometry
    FROM depression_drainage dd
    LEFT JOIN depression_issues di ON dd.depression_id = di.depression_id
    LEFT JOIN depression_assets da ON dd.depression_id = da.depression_id;
  `;

  try {
    const result = await pool.query(query, [wardId]);

    let criticalCount = 0;
    const features = result.rows.map((row) => {
      const vsiResult = calculateVulnerabilityScoringIndex({
        relativeDepressionDepthM: Number(row.relative_depression_depth_m),
        nearestDrainDistanceM: Number(row.drain_distance_m),
        drainCondition: row.drain_condition,
        soilType: row.soil_type,
        historicalWaterloggingIssueCount: Number(row.waterlogging_issue_count),
      });

      if (vsiResult.riskLevel === 'CRITICAL') {
        criticalCount++;
      }

      return {
        type: 'Feature',
        geometry: row.geometry,
        properties: {
          hotspot_id: `DEP-${row.depression_id}`,
          ward_id: row.ward_id,
          risk_level: vsiResult.riskLevel,
          vsi_score: vsiResult.vsiScore,
          relative_depth_m: Number(row.relative_depression_depth_m),
          soil_type: row.soil_type,
          nearest_drain: {
            id: row.nearest_drain_id,
            name: row.drain_name,
            distance_m: Number(row.drain_distance_m),
            condition: row.drain_condition,
          },
          historical_incidents: Number(row.waterlogging_issue_count),
          affected_assets_count: Number(row.asset_count),
          affected_assets: row.affected_assets,
          recommended_action: vsiResult.recommendedAction,
        },
      };
    });

    // Optional filter by minRiskLevel
    const filteredFeatures = minRiskLevel
      ? features.filter((f) => f.properties.risk_level === minRiskLevel.toUpperCase())
      : features;

    return {
      ward_id: wardId,
      total_hotspots: filteredFeatures.length,
      critical_hotspots: criticalCount,
      features: filteredFeatures,
    };
  } catch (error) {
    console.error('Error executing monsoon waterlogging query:', error);
    // Return graceful fallback when table data is sparse
    return {
      ward_id: wardId,
      total_hotspots: 0,
      critical_hotspots: 0,
      features: [],
    };
  }
}
