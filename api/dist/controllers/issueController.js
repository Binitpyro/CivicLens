"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIssuesGeoJSON = getIssuesGeoJSON;
exports.createIssue = createIssue;
exports.updateIssueStatus = updateIssueStatus;
const db_1 = require("../config/db");
async function getIssuesGeoJSON(req, res) {
    try {
        const { category, status, ward_id } = req.query;
        let query = `
      SELECT 
        id, 
        asset_id,
        ward_id, 
        category, 
        severity, 
        description,
        photo_url,
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
        const params = [];
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
        const result = await db_1.pool.query(query, params);
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
                status: row.status,
                reported_by: row.reported_by,
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
    }
    catch (error) {
        console.error('Error fetching issues GeoJSON:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
async function createIssue(req, res) {
    try {
        const { id, asset_id, ward_id, category, severity, description, photo_url, latitude, longitude, client_seq_num } = req.body;
        if (!id || !category || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: 'ID, category, latitude, and longitude are required' });
        }
        const userId = req.user ? req.user.id : null;
        const seqNum = client_seq_num || Date.now();
        const result = await db_1.pool.query(`INSERT INTO issues (
        id, asset_id, ward_id, category, severity, description, photo_url, location, reported_by, client_seq_num, server_received_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326), $10, $11, now())
       ON CONFLICT (id) DO UPDATE SET
         category = EXCLUDED.category,
         severity = EXCLUDED.severity,
         description = EXCLUDED.description,
         photo_url = EXCLUDED.photo_url,
         status = EXCLUDED.status,
         version_id = issues.version_id + 1,
         updated_at = now()
       RETURNING id, category, severity, status, version_id, server_received_at`, [id, asset_id || null, ward_id || 1, category, severity || 'medium', description || '', photo_url || null, longitude, latitude, userId, seqNum]);
        return res.status(201).json(result.rows[0]);
    }
    catch (error) {
        console.error('Error creating issue:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
async function updateIssueStatus(req, res) {
    try {
        const { id } = req.params;
        const { status, assigned_officer } = req.body;
        if (!status || !['open', 'in_progress', 'resolved'].includes(status)) {
            return res.status(400).json({ error: 'Valid status is required (open, in_progress, resolved)' });
        }
        const resolvedDate = status === 'resolved' ? 'now()' : 'NULL';
        const result = await db_1.pool.query(`UPDATE issues 
       SET status = $1,
           assigned_officer = COALESCE($2, assigned_officer),
           date_resolved = ${resolvedDate},
           version_id = version_id + 1,
           updated_at = now()
       WHERE id = $3
       RETURNING id, category, status, version_id, date_resolved`, [status, assigned_officer || null, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Issue not found' });
        }
        return res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error updating issue status:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
//# sourceMappingURL=issueController.js.map