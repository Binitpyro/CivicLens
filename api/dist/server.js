"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const authController_1 = require("./controllers/authController");
const assetController_1 = require("./controllers/assetController");
const issueController_1 = require("./controllers/issueController");
const analyticsController_1 = require("./controllers/analyticsController");
const syncController_1 = require("./controllers/syncController");
const auth_1 = require("./middleware/auth");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
// Health Check endpoint (used by 48h keep-alive script & Render)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'CivicLens API' });
});
// Auth Routes
app.post('/api/auth/login', authController_1.login);
app.post('/api/auth/register', authController_1.register);
// Assets Routes
app.get('/api/assets', assetController_1.getAssetsGeoJSON);
app.post('/api/assets', auth_1.authenticateToken, assetController_1.createAsset);
// Issues Routes
app.get('/api/issues', issueController_1.getIssuesGeoJSON);
app.post('/api/issues', auth_1.authenticateToken, issueController_1.createIssue);
app.patch('/api/issues/:id/status', auth_1.authenticateToken, (0, auth_1.requireRole)('admin', 'panchayat_officer'), issueController_1.updateIssueStatus);
// Analytics Routes
app.get('/api/analytics/summary', analyticsController_1.getSummary);
app.get('/api/analytics/coverage-gaps', analyticsController_1.getCoverageGaps);
app.get('/api/analytics/hotspots', analyticsController_1.getSpatialGridHotspots);
// Sync Outbox Batch Route
app.post('/api/sync', auth_1.authenticateToken, syncController_1.processSyncBatch);
app.listen(PORT, () => {
    console.log(`CivicLens PostGIS API listening on port ${PORT}`);
});
//# sourceMappingURL=server.js.map