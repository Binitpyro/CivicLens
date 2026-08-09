import type { Request, Response } from 'express';
import { pool } from '../config/db';
import type { AuthRequest } from '../middleware/auth';

interface SyncItem {
  id?: number;
  record_id: string;
  table_name: 'assets' | 'issues';
  action: 'create' | 'update' | 'delete';
  payload: any;
  client_seq_num: number;
}

export async function processSyncBatch(req: AuthRequest, res: Response) {
  const { batch } = req.body;
  if (!Array.isArray(batch) || batch.length === 0) {
    return res.status(400).json({ error: 'Sync batch must be a non-empty array' });
  }

  const acks: Array<{ record_id: string; status: 'synced' | 'conflict_logged' | 'error'; error?: string }> = [];

  for (const item of batch as SyncItem[]) {
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
        const { asset_id, ward_id, category, severity, description, photo_url, encrypted_phone, latitude, longitude, status } = payload;
        
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

        // Apply clean upsert
        await pool.query(
          `INSERT INTO issues (
            id, asset_id, ward_id, category, severity, description, photo_url, encrypted_phone, location, status, client_seq_num, server_received_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ST_SetSRID(ST_MakePoint($9, $10), 4326), $11, $12, now())
           ON CONFLICT (id) DO UPDATE SET
             category = EXCLUDED.category,
             severity = EXCLUDED.severity,
             description = EXCLUDED.description,
             photo_url = COALESCE(EXCLUDED.photo_url, issues.photo_url),
             encrypted_phone = COALESCE(EXCLUDED.encrypted_phone, issues.encrypted_phone),
             status = EXCLUDED.status,
             version_id = issues.version_id + 1,
             updated_at = now()`,
          [
            record_id, 
            asset_id || null, 
            ward_id || 1, 
            category, 
            severity || 'medium', 
            description || '', 
            photo_url || null, 
            encrypted_phone || null,
            longitude, 
            latitude, 
            status || 'open', 
            client_seq_num || Date.now()
          ]
        );

        acks.push({ record_id, status: 'synced' });

      } else if (table_name === 'assets') {
        const { ward_id, asset_type, name, lbd_asset_id, status, latitude, longitude, attributes, version_id } = payload;

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
          [record_id, ward_id || 1, asset_type, name || null, lbd_asset_id || null, status || 'active', longitude, latitude, JSON.stringify(attributes || {})]
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
