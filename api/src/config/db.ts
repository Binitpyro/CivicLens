import { Pool } from 'pg';
import { resolve } from 'path';

// Load DATABASE_URL from project root .env if not already in environment
if (!process.env.DATABASE_URL) {
  try {
    (process as any).loadEnvFile?.(resolve(__dirname, '../../../.env'));
  } catch {
    // .env not found — rely on environment variables (e.g. Render)
  }
}

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/civiclens';
const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

// Configure SSL based on environment and host
const getSslConfig = () => {
  if (isLocal) {
    return false;
  }
  // Allow explicit override via DB_SSL_REJECT_UNAUTHORIZED
  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true';
  return { rejectUnauthorized };
};

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: getSslConfig(),
});

pool.on('error', (err) => {
  console.error('Unexpected PostGIS pool error:', err);
});
