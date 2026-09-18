export interface UserProfile {
  id: number;
  name: string;
  phone: string;
  role: 'citizen' | 'volunteer' | 'admin';
  ward_id?: number;
}
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('civiclens_token');
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMessage = 'API Request Failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // ignore
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function loginUser(phone: string, password: string): Promise<{token: string, user: UserProfile}> {
  return fetchWithAuth('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, password })
  });
}

export async function registerUser(name: string, phone: string, password: string, ward_id?: number): Promise<{token: string, user: UserProfile}> {
  return fetchWithAuth('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, phone, password, ward_id })
  });
}
