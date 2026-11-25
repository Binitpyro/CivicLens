import type { Request, Response } from 'express';
import { pool } from '../config/db';

export async function getWard(req: Request, res: Response) {
  const wardId = Number(req.params.id);
  if (!Number.isInteger(wardId) || wardId < 1) {
    return res.status(400).json({ error: 'A valid ward ID is required' });
  }

  try {
    const result = await pool.query(
      `SELECT w.id, w.name, w.lbd_code, w.village_id,
              v.name AS village_name, v.panchayat_code, v.lbd_code AS village_lbd_code
       FROM wards w
       LEFT JOIN villages v ON v.id = w.village_id
       WHERE w.id = $1`,
      [wardId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ward not found' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching ward:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
