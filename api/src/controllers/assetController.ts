import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import type { AuthRequest } from '../middleware/auth';

const queryAssetSchema = z.object({
  type: z.string().trim().optional(),
  ward_id: z.coerce.number().int().positive().optional(),
});

const createAssetSchema = z.object({
  id: z.string().trim().min(1, 'ID is required'),
  ward_id: z.coerce.number().int().positive().default(1),
  asset_type: z.enum([
    'road',
    'handpump',
    'overhead_tank',
    'public_toilet',
    'school',
    'anganwadi',
    'phc',
    'streetlight',
    'drainage',
    'ration_shop',
  ]),
  name: z.string().trim().max(200).nullable().optional(),
  lbd_asset_id: z.string().trim().max(100).nullable().optional(),
  status: z.enum(['active', 'non_functional', 'under_construction']).default('active'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  attributes: z.record(z.string(), z.any()).optional().default({}),
});

export async function getAssetsGeoJSON(req: Request, res: Response) {
  try {
    const parseResult = queryAssetSchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { type, ward_id } = parseResult.data;
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
    const parseResult = createAssetSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const {
      id,
      ward_id,
      asset_type,
      name,
      lbd_asset_id,
      status,
      latitude,
      longitude,
      attributes,
    } = parseResult.data;

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
      [
        id,
        ward_id,
        asset_type,
        name || null,
        lbd_asset_id || null,
        status,
        longitude,
        latitude,
        JSON.stringify(attributes || {}),
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating asset:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
