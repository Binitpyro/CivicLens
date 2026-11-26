import type { Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import type { AuthRequest } from '../middleware/auth';

const syncItemSchema = z.object({
  id: z.number().optional(),
  record_id: z.string().trim().min(1),
  table_name: z.enum(['assets', 'issues']),
  action: z.enum(['create', 'update', 'delete']),
  payload: z.record(z.string(), z.any()),
  client_seq_num: z.number().optional().default(() => Date.now()),
});

const syncBatchSchema = z.object({
  batch: z.array(syncItemSchema).min(1, 'Sync batch must not be empty').max(100, 'Batch size exceeds maximum limit of 100'),
});

export async function processSyncBatch(req: AuthRequest, res: Response) {
  const parseResult = syncBatchSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid sync batch',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { batch } = parseResult.data;
  const acks: Array<{ record_id: string; status: 'synced' | 'conflict_logged' | 'error'; error?: string }> = [];

  for (const item of batch) {
    try {
      const { record_id, table_name, action, payload, client_seq_num } = item;

      // 1. Handle Delete Action
      if (action === 'delete') {
        if (table_name === 'issues') {
          await pool.query('DELETE FROM issues WHERE id = $1', [record_id]);
        } else if (table_name === 'assets') {
          await pool.query('DELETE FROM assets WHERE id = $1', [record_id]);
        }
        acks.push({ record_id, status: 'synced' });
        continue;
      }

      if (table_name === 'issues') {
        const {
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
          status,
        } = payload;

        if (latitude === undefined || longitude === undefined || !category) {
          acks.push({ record_id, status: 'error', error: 'Missing required issue fields (latitude, longitude, category)' });
          continue;
        }

        // Version vector check
        const existing = await pool.query('SELECT version_id, status FROM issues WHERE id = $1', [record_id]);

        if (existing.rows.length > 0) {
          const currentStatus = existing.rows[0].status;
          // Flag conflict if client status clashes with resolved server status
          if (currentStatus === 'resolved' && status === 'open') {
            await pool.query(
              `INSERT INTO sync_conflicts (record_id, table_name, client_payload, server_state, conflict_reason)
               VALUES ($1, $2, $3, $4, $5)`,
              [record_id, table_name, JSON.stringify(payload), JSON.stringify(existing.rows[0]), 'Client reopened a resolved issue offline']
            );
            acks.push({ record_id, status: 'conflict_logged' });
            continue;
          }
        }

        const photosArr = Array.isArray(photos) ? photos : null;
        const effectivePhotoUrl = photo_url || (photosArr && photosArr[0]?.data_url) || null;
        const photosJson = photosArr !== null ? JSON.stringify(photosArr) : null;
        const accuracyVal = typeof gps_accuracy_m === 'number' ? gps_accuracy_m : null;
        const headingVal = typeof heading_deg === 'number' ? heading_deg : null;
        const locationSourceVal =
          location_source === 'gps' || location_source === 'manual_pin' ? location_source : null;
        const effectiveResolutionPhotoUrl =
          resolution_photo_url || resolution_photo_meta?.data_url || null;
        const resolutionMetaJson =
          resolution_photo_meta && typeof resolution_photo_meta === 'object'
            ? JSON.stringify(resolution_photo_meta)
            : null;
        const issueStatus = status || 'open';

        // Apply clean upsert
        await pool.query(
          `INSERT INTO issues (
            id, asset_id, ward_id, category, severity, description, photo_url,
            photos, gps_accuracy_m, heading_deg, location_source,
            resolution_photo_url, resolution_photo_meta,
            encrypted_phone, location, status, date_resolved, client_seq_num, server_received_at
           )
           VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            COALESCE($8::jsonb, '[]'::jsonb), $9, $10, COALESCE($11, 'gps'),
            $12, $13::jsonb,
            $14, ST_SetSRID(ST_MakePoint($15, $16), 4326), $17,
            CASE WHEN $17 = 'resolved' THEN now() ELSE NULL END,
            $18, now()
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
             date_resolved = CASE
               WHEN EXCLUDED.status = 'resolved' THEN COALESCE(issues.date_resolved, now())
               ELSE issues.date_resolved
             END,
             version_id = issues.version_id + 1,
             updated_at = now()`,
          [
            record_id,
            asset_id || null,
            ward_id || 1,
            category,
            severity || 'medium',
            description || '',
            effectivePhotoUrl,
            photosJson,
            accuracyVal,
            headingVal,
            locationSourceVal,
            effectiveResolutionPhotoUrl,
            resolutionMetaJson,
            encrypted_phone || null,
            longitude,
            latitude,
            issueStatus,
            client_seq_num || Date.now(),
          ]
        );

        acks.push({ record_id, status: 'synced' });
      } else if (table_name === 'assets') {
        const {
          ward_id,
          asset_type,
          name,
          lbd_asset_id,
          status,
          latitude,
          longitude,
          attributes,
          version_id,
        } = payload;

        if (latitude === undefined || longitude === undefined || !asset_type) {
          acks.push({ record_id, status: 'error', error: 'Missing required asset fields (latitude, longitude, asset_type)' });
          continue;
        }

        const existing = await pool.query('SELECT version_id FROM assets WHERE id = $1', [record_id]);
        if (existing.rows.length > 0 && version_id && existing.rows[0].version_id > version_id) {
          await pool.query(
            `INSERT INTO sync_conflicts (record_id, table_name, client_payload, server_state, conflict_reason)
             VALUES ($1, $2, $3, $4, $5)`,
            [record_id, table_name, JSON.stringify(payload), JSON.stringify(existing.rows[0]), 'Client version is behind server version']
          );
          acks.push({ record_id, status: 'conflict_logged' });
          continue;
        }

        await pool.query(
          `INSERT INTO assets (id, ward_id, asset_type, name, lbd_asset_id, status, location, attributes)
           VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             status = EXCLUDED.status,
             attributes = EXCLUDED.attributes,
             version_id = assets.version_id + 1,
             updated_at = now()`,
          [
            record_id,
            ward_id || 1,
            asset_type,
            name || null,
            lbd_asset_id || null,
            status || 'active',
            longitude,
            latitude,
            JSON.stringify(attributes || {}),
          ]
        );

        acks.push({ record_id, status: 'synced' });
      } else {
        acks.push({ record_id, status: 'error', error: 'Unsupported table name' });
      }
    } catch (err: any) {
      console.error(`Sync error for item ${item.record_id}:`, err);
      acks.push({ record_id: item.record_id, status: 'error', error: err.message });
    }
  }

  return res.json({
    processed_count: acks.length,
    acks,
    server_timestamp: new Date().toISOString(),
  });
}
