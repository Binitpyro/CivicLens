import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { ALLOWED_ORIGINS } from './config/secrets';
import { login, register } from './controllers/authController';
import { getAssetsGeoJSON, createAsset } from './controllers/assetController';
import { getIssuesGeoJSON, createIssue, updateIssueStatus } from './controllers/issueController';
import {
  checkDuplicateIssues,
  corroborateIssueHandler,
  classifyIssuePhotoHandler,
  getMonsoonVulnerabilityHandler,
} from './controllers/spatialController';
import { getSummary, getCoverageGaps, getSpatialGridHotspots } from './controllers/analyticsController';
import { processSyncBatch } from './controllers/syncController';
import { authenticateToken, optionalAuthenticateToken, requireRole } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// Security headers
app.use(helmet());

// HTTP request logging
app.use(morgan(isProduction ? 'combined' : 'dev'));

// Performance compression
app.use(compression());

// Restricted CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow mobile apps, curl, or same-origin requests with no origin header
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin) || !isProduction) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' },
});

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalApiLimiter);

// Cache-Control headers for high-frequency read endpoints
app.use((req, res, next) => {
  if (
    req.method === 'GET' &&
    (req.path.startsWith('/api/assets') ||
      req.path.startsWith('/api/issues') ||
      req.path.startsWith('/api/analytics'))
  ) {
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
  }
  next();
});

// Health Check endpoint (used by keep-alive script & Render)
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'CivicLens API' });
});

// Auth Routes (Rate Limited)
app.post('/api/auth/login', authLimiter, login);
app.post('/api/auth/register', authLimiter, register);

// Assets Routes
app.get('/api/assets', getAssetsGeoJSON);
app.post('/api/assets', authenticateToken, createAsset);

// Issues Routes (uses optional auth to strip PII from unauthenticated requests)
app.get('/api/issues', optionalAuthenticateToken, getIssuesGeoJSON);
app.post('/api/issues', authenticateToken, createIssue);
app.patch('/api/issues/:id/status', authenticateToken, requireRole('admin', 'panchayat_officer'), updateIssueStatus);

// Spatial Intelligence & Deduplication Routes (Pillar 2)
app.post('/api/issues/check-duplicates', optionalAuthenticateToken, checkDuplicateIssues);
app.post('/api/issues/:id/corroborate', optionalAuthenticateToken, corroborateIssueHandler);
app.post('/api/cv/classify-issue', optionalAuthenticateToken, classifyIssuePhotoHandler);

// Analytics Routes
app.get('/api/analytics/summary', getSummary);
app.get('/api/analytics/coverage-gaps', getCoverageGaps);
app.get('/api/analytics/hotspots', getSpatialGridHotspots);
app.get('/api/analytics/monsoon-vulnerability', optionalAuthenticateToken, getMonsoonVulnerabilityHandler);

// Sync Outbox Batch Route
app.post('/api/sync', authenticateToken, processSyncBatch);

// Centralized Error Handling Middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled API Error:', err);
  const status = err.status || 500;
  res.status(status).json({
    error: isProduction ? 'Internal server error' : err.message || 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`CivicLens PostGIS API listening on port ${PORT}`);
});
