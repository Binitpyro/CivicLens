"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processSyncBatch = processSyncBatch;
const db_1 = require("../config/db");
async function processSyncBatch(req, res) {
    const { batch } = req.body;
    if (!Array.isArray(batch) || batch.length === 0) {
        return res.status(400).json({ error: 'Sync batch must be a non-empty array' });
    }
    const acks = [];
    for (const item of batch) {
        try {
            const { record_id, table_name, action, payload, client_seq_num } = item;
            if (table_name === 'issues') {
                const { asset_id, ward_id, category, severity, description, photo_url, latitude, longitude, status } = payload;
                // Version vector check
                const existing = await db_1.pool.query('SELECT version_id, status FROM issues WHERE id = $1', [record_id]);
                if (existing.rows.length > 0) {
                    const currentStatus = existing.rows[0].status;
                    // Flag conflict if client status clashes with resolved server status
                    if (currentStatus === 'resolved' && status === 'open') {
                        await db_1.pool.query(`INSERT INTO sync_conflicts (record_id, table_name, client_payload, server_state, conflict_reason)
               VALUES ($1, $2, $3, $4, $5)`, [record_id, table_name, JSON.stringify(payload), JSON.stringify(existing.rows[0]), 'Client reopened a resolved issue offline']);
                        acks.push({ record_id, status: 'conflict_logged' });
                        continue;
                    }
                }
                // Apply clean upsert
                await db_1.pool.query(`INSERT INTO issues (
            id, asset_id, ward_id, category, severity, description, photo_url, location, status, client_seq_num, server_received_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326), $10, $11, now())
           ON CONFLICT (id) DO UPDATE SET
             category = EXCLUDED.category,
             severity = EXCLUDED.severity,
             description = EXCLUDED.description,
             photo_url = COALESCE(EXCLUDED.photo_url, issues.photo_url),
             status = EXCLUDED.status,
             version_id = issues.version_id + 1,
             updated_at = now()`, [
                    record_id,
                    asset_id || null,
                    ward_id || 1,
                    category,
                    severity || 'medium',
                    description || '',
                    photo_url || null,
                    longitude,
                    latitude,
                    status || 'open',
                    client_seq_num || Date.now()
                ]);
                acks.push({ record_id, status: 'synced' });
            }
            else if (table_name === 'assets') {
                const { ward_id, asset_type, name, lbd_asset_id, status, latitude, longitude, attributes } = payload;
                await db_1.pool.query(`INSERT INTO assets (id, ward_id, asset_type, name, lbd_asset_id, status, location, attributes)
           VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             status = EXCLUDED.status,
             attributes = EXCLUDED.attributes,
             version_id = assets.version_id + 1,
             updated_at = now()`, [record_id, ward_id || 1, asset_type, name || null, lbd_asset_id || null, status || 'active', longitude, latitude, JSON.stringify(attributes || {})]);
                acks.push({ record_id, status: 'synced' });
            }
            else {
                acks.push({ record_id, status: 'error', error: 'Unsupported table name' });
            }
        }
        catch (err) {
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
//# sourceMappingURL=syncController.js.map