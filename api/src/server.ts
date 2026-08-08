import express from 'express';
import cors from 'cors';
import { login, register } from './controllers/authController';
import { getAssetsGeoJSON, createAsset } from './controllers/assetController';
import { getIssuesGeoJSON, createIssue, updateIssueStatus } from './controllers/issueController';
import { getSummary, getCoverageGaps, getSpatialGridHotspots } from './controllers/analyticsController';
import { processSyncBatch } from './controllers/syncController';
import { authenticateToken, requireRole } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health Check endpoint (used by 48h keep-alive script & Render)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'CivicLens API' });
});

// Auth Routes
app.post('/api/auth/login', login);
app.post('/api/auth/register', register);

// Assets Routes
app.get('/api/assets', getAssetsGeoJSON);
app.post('/api/assets', authenticateToken, createAsset);

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
