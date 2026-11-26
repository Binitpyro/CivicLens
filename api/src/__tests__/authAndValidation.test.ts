import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/secrets';
import { requireRole, type AuthRequest } from '../middleware/auth';

describe('API Auth & Security Infrastructure', () => {
  it('loads a valid non-empty JWT_SECRET', () => {
    expect(JWT_SECRET).toBeDefined();
    expect(typeof JWT_SECRET).toBe('string');
    expect(JWT_SECRET.length).toBeGreaterThan(10);
  });

  it('signs and verifies JWT tokens accurately', () => {
    const payload = { id: 1, phone: '9876543210', role: 'admin', ward_id: 1 };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

    const decoded = jwt.verify(token, JWT_SECRET) as typeof payload;
    expect(decoded.id).toBe(1);
    expect(decoded.phone).toBe('9876543210');
    expect(decoded.role).toBe('admin');
  });

  it('fails verification on tampered JWT tokens', () => {
    const token = jwt.sign({ id: 1, role: 'viewer' }, JWT_SECRET);
    expect(() => jwt.verify(token, 'wrong-secret-key')).toThrow();
  });

  describe('Role Authorization Guard (requireRole)', () => {
    it('allows access when user possesses an authorized role', () => {
      const middleware = requireRole('admin', 'panchayat_officer');
      const req = { user: { id: 1, phone: '9876543210', role: 'admin', ward_id: 1 } } as AuthRequest;
      let nextCalled = false;
      const res = {
        status: () => res,
        json: () => res,
      } as any;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);
      expect(nextCalled).toBe(true);
    });

    it('denies access (403) when user lacks the required role', () => {
      const middleware = requireRole('admin');
      const req = { user: { id: 2, phone: '9876543210', role: 'viewer', ward_id: 1 } } as AuthRequest;
      let nextCalled = false;
      let statusCode = 0;
      let jsonPayload: any = null;

      const res = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonPayload = data;
          return res;
        },
      } as any;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);
      expect(nextCalled).toBe(false);
      expect(statusCode).toBe(403);
      expect(jsonPayload?.error).toBe('Insufficient permissions');
    });
  });
});
