import type { Request, Response } from 'express';
import { pool } from '../config/db';

export async function getSummary(req: Request, res: Response) {
  try {
    const { ward_id } = req.query;
    const wardId = ward_id || 1;

    // Asset count by type
    const assetCounts = await pool.query(
      `SELECT asset_type, COUNT(*) as count 
       FROM assets 
       WHERE ward_id = $1 
       GROUP BY asset_type`,
      [wardId]
    );

    // Issue count by category
    const categoryCounts = await pool.query(
      `SELECT category, COUNT(*) as count 
       FROM issues 
       WHERE ward_id = $1 
       GROUP BY category`,
      [wardId]
    );

    // Issue count by status
    const statusCounts = await pool.query(
      `SELECT status, COUNT(*) as count 
       FROM issues 
       WHERE ward_id = $1 
       GROUP BY status`,
      [wardId]
    );

    // Issue count by severity
    const severityCounts = await pool.query(
      `SELECT severity, COUNT(*) as count 
       FROM issues 
       WHERE ward_id = $1 
       GROUP BY severity`,
      [wardId]
    );

    return res.json({
      ward_id: wardId,
      assets: assetCounts.rows,
      issues_by_category: categoryCounts.rows,
      issues_by_status: statusCounts.rows,
      issues_by_severity: severityCounts.rows,
    });
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getCoverageGaps(req: Request, res: Response) {
  try {
    const { distance_m, ward_id } = req.query;
    const radiusMeters = parseInt(distance_m as string) || 500;
    const wardId = ward_id || 1;

    // PostGIS ST_DWithin Buffer Analysis: Schools with no working handpump within N meters
    const query = `
      SELECT 
        s.id, 
        s.name, 
        s.asset_type, 
        ST_AsGeoJSON(s.location)::json AS geometry
      FROM assets s
      WHERE s.ward_id = $1 
        AND s.asset_type IN ('school', 'anganwadi', 'phc')
        AND NOT EXISTS (
          SELECT 1 
          FROM assets h
          WHERE h.asset_type = 'handpump'
            AND h.status = 'active'
            AND ST_DWithin(s.location::geography, h.location::geography, $2)
        )
    `;

    const result = await pool.query(query, [wardId, radiusMeters]);

    const features = result.rows.map((row) => ({
      type: 'Feature',
      geometry: row.geometry,
      properties: {
        id: row.id,
        name: row.name,
        type: row.asset_type,
        gap_type: 'No active handpump within ' + radiusMeters + 'm',
      },
    }));

    return res.json({
      type: 'FeatureCollection',
      features,
    });
  } catch (error) {
    console.error('Error calculating coverage gaps:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getSpatialGridHotspots(req: Request, res: Response) {
  try {
    const { ward_id } = req.query;
    const wardId = ward_id || 1;

    // Use ST_SnapToGrid for lightweight spatial aggregation instead of heavy ST_ClusterKMeans
    const query = `
      SELECT 
        ST_AsGeoJSON(ST_Centroid(ST_Collect(location)))::json AS geometry,
        COUNT(*) AS issue_count,
        MAX(severity) AS peak_severity
      FROM issues
      WHERE ward_id = $1 AND status != 'resolved'
      GROUP BY ST_SnapToGrid(location, 0.005)
    `;

    const result = await pool.query(query, [wardId]);

    const features = result.rows.map((row, idx) => ({
      type: 'Feature',
      geometry: row.geometry,
      properties: {
        cluster_id: idx + 1,
        count: parseInt(row.issue_count, 10),
        peak_severity: row.peak_severity,
      },
    }));

    return res.json({
      type: 'FeatureCollection',
      features,
    });
  } catch (error) {
    console.error('Error fetching spatial grid hotspots:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
