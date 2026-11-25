import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// Robust .env loader that checks current working directory, api directory, and project root
if (!process.env.DATABASE_URL) {
  const possibleEnvPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../../../.env'),
  ];

  for (const envPath of possibleEnvPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const fileContent = fs.readFileSync(envPath, 'utf8');
        fileContent.split('\n').forEach((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const eqIdx = trimmed.indexOf('=');
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        });
        break;
      } catch {
        // Continue searching
      }
    }
  }
}

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/civiclens';

const requiresSsl = connectionString.includes('sslmode=require') || 
                    connectionString.includes('render.com') || 
                    connectionString.includes('neon.tech') || 
                    connectionString.includes('supabase.co') || 
                    connectionString.includes('supabase.com') || 
                    connectionString.includes('pooler.supabase.com');

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('Unexpected PostGIS pool error:', err.message);
});

// Non-blocking connection check on startup
pool.query('SELECT 1')
  .then(() => {
    console.log('✓ Database connection established successfully');
  })
  .catch((err) => {
    console.warn(`⚠️ Database connection notice: ${err.message}`);
    console.warn('   Ensure your DATABASE_URL in .env points to your Supabase or PostgreSQL instance.');
  });

