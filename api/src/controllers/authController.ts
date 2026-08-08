import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'civiclens-super-secret-key-2026';

export async function login(req: Request, res: Response) {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role, ward_id: user.ward_id },
      JWT_SECRET,
      { expiresIn: '30d' } // Long-lived token for offline field resilience
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        ward_id: user.ward_id
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function register(req: Request, res: Response) {
  try {
    const { name, phone, password, role, ward_id } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Name, phone, and password are required' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, phone, password_hash, role, ward_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, phone, role, ward_id`,
      [name, phone, passwordHash, role || 'viewer', ward_id || 1]
    );

    const newUser = result.rows[0];
    const token = jwt.sign(
      { id: newUser.id, phone: newUser.phone, role: newUser.role, ward_id: newUser.ward_id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(201).json({ token, user: newUser });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Phone number already registered' });
    }
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
