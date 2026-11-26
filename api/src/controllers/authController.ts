import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../config/db';
import { JWT_SECRET } from '../config/secrets';

const loginSchema = z.object({
  phone: z.string().trim().min(5, 'Phone must be at least 5 digits').max(20),
  password: z.string().min(4, 'Password must be at least 4 characters').max(100),
});

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().trim().min(5, 'Phone must be at least 5 digits').max(20),
  password: z.string().min(4, 'Password must be at least 4 characters').max(100),
  ward_id: z.coerce.number().int().positive().optional(),
});

export async function login(req: Request, res: Response) {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { phone, password } = parseResult.data;

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
      { expiresIn: '30d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        ward_id: user.ward_id,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function register(req: Request, res: Response) {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { name, phone, password, ward_id } = parseResult.data;

    // Security: Public self-registration always defaults strictly to 'viewer'
    // Prevents privilege escalation where attackers pass role: 'admin'
    const assignedRole = 'viewer';

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, phone, password_hash, role, ward_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, phone, role, ward_id`,
      [name, phone, passwordHash, assignedRole, ward_id || 1]
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
