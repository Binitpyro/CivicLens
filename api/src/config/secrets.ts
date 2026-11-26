import { resolve } from 'path';

// Load .env from project root if not already loaded in process.env
if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) {
  try {
    (process as any).loadEnvFile?.(resolve(__dirname, '../../../.env'));
  } catch {
    // .env not found — rely on system environment variables
  }
}

const isProduction = process.env.NODE_ENV === 'production';
const envSecret = process.env.JWT_SECRET;

if (isProduction && (!envSecret || envSecret === 'civiclens-super-secret-key-2026')) {
  console.warn('CRITICAL SECURITY WARNING: Production environment detected with insecure or missing JWT_SECRET! Set a cryptographically strong JWT_SECRET.');
}

export const JWT_SECRET = envSecret || (isProduction
  ? (() => { throw new Error('JWT_SECRET must be set in production'); })()
  : 'civiclens-dev-secret-key-local-only-2026');

export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
      'http://127.0.0.1:4173',
      'https://civiclens.vercel.app',
      'https://civiclens-api.onrender.com',
    ];
