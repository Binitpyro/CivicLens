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

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected PostGIS pool error:', err);
});
