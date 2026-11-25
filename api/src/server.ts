import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { login, register } from './controllers/authController';
import { getAssetsGeoJSON, createAsset, bulkUpsertAssets } from './controllers/assetController';
import { getIssuesGeoJSON, createIssue, updateIssueStatus } from './controllers/issueController';
import { getSummary, getCoverageGaps, getSpatialGridHotspots } from './controllers/analyticsController';
import { processSyncBatch } from './controllers/syncController';
import { authenticateToken, requireRole } from './middleware/auth';
import { getWard } from './controllers/wardController';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// HTTP Security Headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Cache-Control headers for high-frequency read endpoints
app.use((req, res, next) => {
  if (req.method === 'GET' && (req.path.startsWith('/api/assets') || req.path.startsWith('/api/issues') || req.path.startsWith('/api/analytics'))) {
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
  }
  next();
});

// In-memory rate limiter for authentication
const loginAttempts = new Map<string, { count: number; resetTime: number }>();
function loginRateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (record && now < record.resetTime) {
    if (record.count >= 10) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
    }
    record.count++;
  } else {
    loginAttempts.set(ip, { count: 1, resetTime: now + 15 * 60 * 1000 });
  }
  next();
}

// Health Check endpoint (used by 48h keep-alive script & Render)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'CivicLens API' });
});

app.get('/api/wards/:id', getWard);

// Auth Routes
app.post('/api/auth/login', loginRateLimiter, login);
app.post('/api/auth/register', register);

// Assets Routes
app.get('/api/assets', getAssetsGeoJSON);
app.post('/api/assets', authenticateToken, createAsset);
app.post('/api/assets/bulk', authenticateToken, bulkUpsertAssets);

// Issues Routes
app.get('/api/issues', getIssuesGeoJSON);
app.post('/api/issues', authenticateToken, createIssue);
app.patch('/api/issues/:id/status', authenticateToken, requireRole('admin', 'panchayat_officer'), updateIssueStatus);

// Analytics Routes
app.get('/api/analytics/summary', getSummary);
app.get('/api/analytics/coverage-gaps', getCoverageGaps);
app.get('/api/analytics/hotspots', getSpatialGridHotspots);

// Sync Outbox Batch Route
app.post('/api/sync', authenticateToken, processSyncBatch);

app.listen(PORT, () => {
  console.log(`CivicLens PostGIS API listening on port ${PORT}`);
});
