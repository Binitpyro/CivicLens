import type { Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import type { AuthRequest } from '../middleware/auth';

const queryFilterSchema = z.object({
  category: z.string().trim().optional(),
  status: z.enum(['open', 'in_progress', 'resolved']).optional(),
  ward_id: z.coerce.number().int().positive().optional(),
});

const photoMetaSchema = z
  .object({
    data_url: z.string().min(1),
    dhash: z.string().optional().default(''),
    captured_at: z.string().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    accuracy_m: z.number().min(0).nullable().optional(),
    heading_deg: z.number().min(0).max(360).nullable().optional(),
    location_source: z.enum(['gps', 'manual_pin']).nullable().optional(),
    capture_source: z.enum(['camera_native', 'camera_webrtc']).optional(),
    quality_warnings: z.array(z.string()).optional().default([]),
  })
  .passthrough();

const createIssueSchema = z.object({
  id: z.string().trim().min(1, 'ID is required'),
  asset_id: z.string().trim().nullable().optional(),
  ward_id: z.coerce.number().int().positive().default(1),
  category: z.string().trim().min(1, 'Category is required'),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  description: z.string().max(3000).default(''),
  photo_url: z.string().nullable().optional(),
  photos: z.array(photoMetaSchema).max(3).optional(),
  gps_accuracy_m: z.number().min(0).nullable().optional(),
  heading_deg: z.number().min(0).max(360).nullable().optional(),
  location_source: z.enum(['gps', 'manual_pin']).optional(),
  resolution_photo_url: z.string().nullable().optional(),
  resolution_photo_meta: photoMetaSchema.nullable().optional(),
  encrypted_phone: z.string().nullable().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  client_seq_num: z.number().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved']),
  assigned_officer: z.string().trim().max(200).optional(),
  resolution_photo_url: z.string().nullable().optional(),
  resolution_photo_meta: photoMetaSchema.nullable().optional(),
});

export async function getIssuesGeoJSON(req: AuthRequest, res: Response) {
  try {
    const parseResult = queryFilterSchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { category, status, ward_id } = parseResult.data;
    let query = `
      SELECT 
        id, 
        asset_id,
        ward_id, 
        category, 
        severity, 
        description,
        photo_url,
        photos,
        gps_accuracy_m,
        heading_deg,
        location_source,
        resolution_photo_url,
        resolution_photo_meta,
        encrypted_phone,
        status, 
        reported_by,
        assigned_officer,
        version_id,
        client_seq_num,
        server_received_at,
        date_reported,
        date_resolved,
        ST_AsGeoJSON(location)::json AS geometry
      FROM issues
      WHERE 1=1
    `;
    const params: any[] = [];

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    if (ward_id) {
      params.push(ward_id);
      query += ` AND ward_id = $${params.length}`;
    }

    const result = await pool.query(query, params);

    // Data privacy: Only administrative roles can view reporter contact details / PII
    const canViewPII = req.user && ['admin', 'panchayat_officer'].includes(req.user.role);

    const features = result.rows.map((row) => ({
      type: 'Feature',
      geometry: row.geometry,
      properties: {
        id: row.id,
        asset_id: row.asset_id,
        ward_id: row.ward_id,
        category: row.category,
        severity: row.severity,
        description: row.description,
        photo_url: row.photo_url,
        photos: row.photos ?? [],
        gps_accuracy_m: row.gps_accuracy_m ?? null,
        heading_deg: row.heading_deg ?? null,
        location_source: row.location_source ?? 'gps',
        resolution_photo_url: row.resolution_photo_url ?? null,
        resolution_photo_meta: row.resolution_photo_meta ?? null,
        encrypted_phone: canViewPII ? row.encrypted_phone : undefined,
        status: row.status,
        reported_by: canViewPII ? row.reported_by : undefined,
        assigned_officer: row.assigned_officer,
        version_id: row.version_id,
        client_seq_num: row.client_seq_num,
        server_received_at: row.server_received_at,
        date_reported: row.date_reported,
        date_resolved: row.date_resolved,
      },
    }));

    return res.json({
      type: 'FeatureCollection',
      features,
    });
  } catch (error) {
    console.error('Error fetching issues GeoJSON:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createIssue(req: AuthRequest, res: Response) {
  try {
    const parseResult = createIssueSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const {
      id,
      asset_id,
      ward_id,
      category,
      severity,
      description,
      photo_url,
      photos,
      gps_accuracy_m,
      heading_deg,
      location_source,
      resolution_photo_url,
      resolution_photo_meta,
      encrypted_phone,
      latitude,
      longitude,
      client_seq_num,
    } = parseResult.data;

    const userId = req.user ? req.user.id : null;
    const seqNum = client_seq_num || Date.now();
    const effectivePhotoUrl = photo_url || photos?.[0]?.data_url || null;
    const photosJson = photos !== undefined ? JSON.stringify(photos) : null;
    const effectiveResolutionPhotoUrl =
      resolution_photo_url || resolution_photo_meta?.data_url || null;
    const resolutionMetaJson = resolution_photo_meta
      ? JSON.stringify(resolution_photo_meta)
      : null;

    const result = await pool.query(
      `INSERT INTO issues (
        id, asset_id, ward_id, category, severity, description, photo_url,
        photos, gps_accuracy_m, heading_deg, location_source,
        resolution_photo_url, resolution_photo_meta,
        encrypted_phone, location, reported_by, client_seq_num, server_received_at
       )
       VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        COALESCE($8::jsonb, '[]'::jsonb), $9, $10, COALESCE($11, 'gps'),
        $12, $13::jsonb,
        $14, ST_SetSRID(ST_MakePoint($15, $16), 4326), $17, $18, now()
       )
       ON CONFLICT (id) DO UPDATE SET
         category = EXCLUDED.category,
         severity = EXCLUDED.severity,
         description = EXCLUDED.description,
         photo_url = COALESCE(EXCLUDED.photo_url, issues.photo_url),
         photos = COALESCE($8::jsonb, issues.photos),
         gps_accuracy_m = COALESCE(EXCLUDED.gps_accuracy_m, issues.gps_accuracy_m),
         heading_deg = COALESCE(EXCLUDED.heading_deg, issues.heading_deg),
         location_source = COALESCE($11, issues.location_source),
         resolution_photo_url = COALESCE(EXCLUDED.resolution_photo_url, issues.resolution_photo_url),
         resolution_photo_meta = COALESCE(EXCLUDED.resolution_photo_meta, issues.resolution_photo_meta),
         encrypted_phone = COALESCE(EXCLUDED.encrypted_phone, issues.encrypted_phone),
         status = EXCLUDED.status,
         version_id = issues.version_id + 1,
         updated_at = now()
       RETURNING id, category, severity, status, photo_url, photos, gps_accuracy_m, heading_deg, location_source, resolution_photo_url, resolution_photo_meta, version_id, server_received_at`,
      [
        id,
        asset_id || null,
        ward_id,
        category,
        severity,
        description,
        effectivePhotoUrl,
        photosJson,
        gps_accuracy_m ?? null,
        heading_deg ?? null,
        location_source ?? null,
        effectiveResolutionPhotoUrl,
        resolutionMetaJson,
        encrypted_phone || null,
        longitude,
        latitude,
        userId,
        seqNum,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating issue:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateIssueStatus(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Issue ID parameter is required' });
    }

    const parseResult = updateStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { status, assigned_officer, resolution_photo_url, resolution_photo_meta } = parseResult.data;
    const resolvedDate = status === 'resolved' ? 'now()' : 'NULL';
    const effectiveResolutionPhotoUrl =
      resolution_photo_url || resolution_photo_meta?.data_url || null;
    const resolutionMetaJson = resolution_photo_meta
      ? JSON.stringify(resolution_photo_meta)
      : null;

    const result = await pool.query(
      `UPDATE issues 
       SET status = $1,
           assigned_officer = COALESCE($2, assigned_officer),
           resolution_photo_url = CASE WHEN $1 = 'resolved' THEN COALESCE($3, resolution_photo_url) ELSE resolution_photo_url END,
           resolution_photo_meta = CASE WHEN $1 = 'resolved' THEN COALESCE($4::jsonb, resolution_photo_meta) ELSE resolution_photo_meta END,
           date_resolved = ${resolvedDate},
           version_id = version_id + 1,
           updated_at = now()
       WHERE id = $5
       RETURNING id, category, status, assigned_officer, resolution_photo_url, resolution_photo_meta, version_id, date_resolved`,
      [status, assigned_officer || null, effectiveResolutionPhotoUrl, resolutionMetaJson, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating issue status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
