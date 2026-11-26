import { describe, it, expect, vi, beforeEach } from 'vitest';
import { API_BASE, loginUser, registerUser } from '../apiService';

describe('apiService Client', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('defines a valid API_BASE url', () => {
    expect(API_BASE).toBeDefined();
    expect(typeof API_BASE).toBe('string');
    expect(API_BASE.length).toBeGreaterThan(0);
  });

  it('sends login request with JSON payload', async () => {
    const mockResponse = {
      token: 'mock-jwt-token',
      user: { id: 1, name: 'Ramesh', phone: '9876543210', role: 'viewer', ward_id: 1 },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const result = await loginUser('9876543210', 'secret123');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phone: '9876543210', password: 'secret123' }),
      })
    );
    expect(result.token).toBe('mock-jwt-token');
    expect(result.user.name).toBe('Ramesh');
  });

  it('sends register request with user payload', async () => {
    const mockResponse = {
      token: 'mock-reg-token',
      user: { id: 2, name: 'Sita', phone: '9876500000', role: 'viewer', ward_id: 1 },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => mockResponse,
    } as Response);

    const result = await registerUser('Sita', '9876500000', 'password123', 1);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/auth/register'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Sita', phone: '9876500000', password: 'password123', ward_id: 1 }),
      })
    );
    expect(result.token).toBe('mock-reg-token');
    expect(result.user.name).toBe('Sita');
  });

  it('throws helpful error message on API failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid phone or password' }),
    } as Response);

    await expect(loginUser('9876543210', 'wrong')).rejects.toThrow('Invalid phone or password');
  });
});
