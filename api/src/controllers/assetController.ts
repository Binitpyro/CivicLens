import type { Request, Response } from 'express';
import { pool } from '../config/db';
import type { AuthRequest } from '../middleware/auth';

export async function getAssetsGeoJSON(req: Request, res: Response) {
  try {
    const { type, ward_id } = req.query;
    let query = `
      SELECT 
        id, 
        ward_id, 
        asset_type, 
        name, 
        lbd_asset_id,
        status, 
        attributes, 
        version_id,
        ST_AsGeoJSON(location)::json AS geometry
      FROM assets
      WHERE 1=1
    `;
    const params: any[] = [];

    if (type) {
      params.push(type);
      query += ` AND asset_type = $${params.length}`;
    }
    if (ward_id) {
      params.push(ward_id);
      query += ` AND ward_id = $${params.length}`;
    }

    const result = await pool.query(query, params);

    const features = result.rows.map((row) => ({
      type: 'Feature',
      geometry: row.geometry,
      properties: {
        id: row.id,
        ward_id: row.ward_id,
        asset_type: row.asset_type,
        name: row.name,
        lbd_asset_id: row.lbd_asset_id,
        status: row.status,
        attributes: row.attributes,
        version_id: row.version_id,
      },
    }));

    return res.json({
      type: 'FeatureCollection',
      features,
    });
  } catch (error) {
    console.error('Error fetching assets GeoJSON:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createAsset(req: AuthRequest, res: Response) {
  try {
    const { id, ward_id, asset_type, name, lbd_asset_id, status, latitude, longitude, attributes } = req.body;
    if (!id || !asset_type || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'ID, asset_type, latitude, and longitude are required' });
    }

    const result = await pool.query(
      `INSERT INTO assets (id, ward_id, asset_type, name, lbd_asset_id, status, location, attributes)
       VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         status = EXCLUDED.status,
         attributes = EXCLUDED.attributes,
         version_id = assets.version_id + 1,
         updated_at = now()
       RETURNING id, asset_type, status, version_id`,
      [id, ward_id || 1, asset_type, name, lbd_asset_id, status || 'active', longitude, latitude, JSON.stringify(attributes || {})]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating asset:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
