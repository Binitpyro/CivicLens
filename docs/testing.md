# CivicLens — Automated Testing & CI Guide

CivicLens uses **Vitest (`^5.1.1`)** across both the backend API (`api/`) and the frontend PWA (`app/`). All **12 test suites** (**88 tests total**: 26 API tests + 62 App tests) run locally without requiring a live PostgreSQL instance or mobile device.

---

## 1. Running Tests

### Backend API (`api/`)

Configured in [`api/package.json`](../api/package.json) (`"test": "vitest run src"`):

```bash
cd api
npm test
```

- **Test Runner:** Vitest in Node environment.
- **HTTP & Database Testing:** Controller/route integration tests use `supertest` (`^7.3.2`) against an in-process Express 5 test app and mock PostgreSQL queries via `vi.mock('../config/db')`.

### Frontend PWA (`app/`)

Configured in [`app/package.json`](../app/package.json) (`"test": "vitest run"`) and [`app/vite.config.ts`](../app/vite.config.ts):

```bash
cd app
npm test
```

- **Test Environment:** `happy-dom` (`^21.0.4`), configured globally in `app/vite.config.ts` (`test: { environment: 'happy-dom' }`) and explicitly annotated in DOM/React hook tests (`// @vitest-environment happy-dom`).
- **Additional Checks:**
  - `npm run lint` — ESLint (`eslint .`)
  - `npm run build` — TypeScript project check (`tsc -b`) + Vite production PWA bundle (`vite build`)

---

## 2. Backend API Test Suites (`api/src/__tests__/`)

**Total: 3 suites, 26 tests**

| Suite | File | Tests | What It Verifies |
| :--- | :--- | :---: | :--- |
| **Auth & Validation** | [`api/src/__tests__/authAndValidation.test.ts`](../api/src/__tests__/authAndValidation.test.ts) | 5 | Non-empty `JWT_SECRET` loading; JWT signing and verification; rejection of tampered tokens; `requireRole()` middleware allowing authorized roles (`admin`, `panchayat_officer`) and returning `403 Insufficient permissions` for unauthorized roles (`viewer`). |
| **Media & GPS Sync** | [`api/src/__tests__/mediaAndGpsSync.test.ts`](../api/src/__tests__/mediaAndGpsSync.test.ts) | 8 | Uses `supertest` + mocked `pool.query` to verify: presence of media/GPS columns (`photos`, `gps_accuracy_m`, `heading_deg`, `location_source`, `resolution_photo_url`, `resolution_photo_meta`) in `schema.sql` and idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements in `migration.sql`; `POST /api/issues` multi-photo persistence, `0°` North heading preservation, and 400 validation on `> 3` photos or invalid `location_source`; `GET /api/issues` GeoJSON property mapping; `PATCH /api/issues/:id/status` resolution photo persistence and 404 handling; `POST /api/sync` batch upserts with `NULL` + `COALESCE` field preservation. |
| **Spatial Intelligence** | [`api/src/__tests__/spatialIntelligence.test.ts`](../api/src/__tests__/spatialIntelligence.test.ts) | 13 | Haversine distance calculations around the 30m deduplication radius; cardinal bearing degrees (`0°` North, `90°` East) and `<1m` collocation `null` guard; `calculatePriorityScore` with severity weights, logarithmic upvote bonuses, and vital-asset proximity cap (`100.0`); 64-bit grayscale `dHash` generation and Hamming distance (`<= 6` duplicate threshold); `calculateVisualSeverity` hazard flags (`WATERBORNE_DISEASE_VECTOR`, `ROAD_TRANSIT_DISRUPTION`, `SUBMERGED_POTHOLE_COLLAPSE_HAZARD`); 30-day stale photo authenticity check; `classifyRuralIssuePhoto` pipeline; and `calculateVulnerabilityScoringIndex` (`CRITICAL`, `MODERATE`, `LOW` VSI tiers). |

---

## 3. Frontend App Test Suites (`app/src/**/__tests__/`)

**Total: 9 suites, 62 tests**

| Suite | File | Tests | What It Verifies |
| :--- | :--- | :---: | :--- |
| **PII Encryption** | [`app/src/db/__tests__/piiEncryption.test.ts`](../app/src/db/__tests__/piiEncryption.test.ts) | 3 | WebCrypto `encryptPII` and `decryptPII` round-trip for phone numbers, graceful empty-string handling, and distinct ciphertexts per encryption via random IVs. |
| **Geolocation & Compass** | [`app/src/hooks/__tests__/useGeolocation.test.ts`](../app/src/hooks/__tests__/useGeolocation.test.ts) | 9 | `getQualityTier` accuracy thresholds (`excellent` `<=15m`, `fair` `<=50m`, `poor` `>50m`, `none`); `useGeolocation` starting with `null` coordinates (no silent fallback) and progressive watch refinement; native Capacitor permission checks; manual pin override; `useCompassHeading` and `degreesToCardinal`; and `PermissionPromptCard` accessible recovery UI. |
| **API Client Service** | [`app/src/services/__tests__/apiService.test.ts`](../app/src/services/__tests__/apiService.test.ts) | 4 | `API_BASE` configuration, `loginUser` and `registerUser` `fetch` payloads, and error message propagation on non-OK HTTP responses. |
| **Camera & Edge Vision** | [`app/src/services/__tests__/cameraAndVision.test.ts`](../app/src/services/__tests__/cameraAndVision.test.ts) | 12 | `analyzePhotoQuality` (blur, dark/overexposed, low-variance checks) using a synthetic 2D canvas pixel mock; `compressPhotoOffThread` and `formatTelemetryStamp`; `captureCameraOnlyPhoto` with mocked `@capacitor/camera` (`CameraPermissionError`, `CameraCancelledError`, `CameraUnavailableError`); WebRTC stream acquisition/cleanup; and offline sync integration. |
| **CivicMesh P2P Sync** | [`app/src/services/__tests__/meshSyncService.test.ts`](../app/src/services/__tests__/meshSyncService.test.ts) | 10 | `computeTamperHash` SHA-256 consistency and tamper detection; `CivicMeshEngine` `HELLO` and delta query calculation; Data Mule relay chaining (`relayed_by`) and monotonic status lattice (`resolved` supersedes `open`); QR payload chunking/reassembly (`chunkPayloadForQR`, `reassembleQRChunks`); `MeshRendezvousSession`; and `encryptPIIForDataMule`. |
| **PMTiles v3 Service** | [`app/src/services/__tests__/pmtilesService.test.ts`](../app/src/services/__tests__/pmtilesService.test.ts) | 10 | `parsePMTilesHeader` (127-byte minimum, magic bytes `PMTi`, v3 header fields/bounds); `zxyToTileId` Hilbert tile ID mapping; `findTileEntry` exact and run-length span lookups; and `IndexedDbPMTilesSource` zero-copy `Blob.slice()` byte-range reads and out-of-bounds error handling. |
| **Route Optimization (TSP)** | [`app/src/services/__tests__/routeOptimizationService.test.ts`](../app/src/services/__tests__/routeOptimizationService.test.ts) | 8 | `calculateRuralDistanceKm` with `1.35x` rural tortuosity factor; `checkSegmentCrossesBarrier` canal detour penalties; `computeTicketPriorityScore`; `optimizeMaintenanceRoute` (empty routes, critical water prioritization, 45-minute shift-limit unserved flagging); and `buildPgRoutingTspQuery` SQL generation (`pgr_dijkstraCostMatrix`, `pgr_tsp`). |
| **Client Spatial Helpers** | [`app/src/services/__tests__/spatialPillar2.test.ts`](../app/src/services/__tests__/spatialPillar2.test.ts) | 3 | Client-side `calculateHaversineDistance`, `calculateCompassBearing` (including collocated `<1m` `null` guard), and 64-bit hex `computeHammingDistance`. |
| **MapView Component** | [`app/src/views/__tests__/MapView.test.tsx`](../app/src/views/__tests__/MapView.test.tsx) | 3 | Renders `MapView` with mocked `leaflet`, `useGeolocation`, `useCompassHeading`, `useOfflineSync`, and Dexie `db`; verifies live GPS marker, accuracy circle, heading cone updates, and manual pin placement behavior. |

---

## 4. Continuous Integration (`.github/workflows/ci.yml`)

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs automatically on `push` and `pull_request` to branches `main`, `master`, and `binit` using `ubuntu-latest` and Node.js 20:

1. **`test-api` (`API Build & Test`)**
   - `npm ci` in `api/`
   - `npm run build` (`tsc`)
   - `npm test` (`vitest run src`)
2. **`test-app` (`Frontend PWA Build & Test`)**
   - `npm ci` in `app/`
   - `npm run lint` (`eslint .`)
   - `npm test` (`vitest run`)
   - `npm run build` (`tsc -b && vite build`)

---

## Related Documentation

- [Deployment, Local Dev & Android Build Guide](./deployment-and-android.md) — Environment variables, Docker Compose, Render/Supabase/Vercel setup, and APK builds.
- [Pillar 2: Advanced GIS & Spatial Intelligence](./pillar2-advanced-gis-spatial-intelligence.md) — Spatial deduplication, edge CV, and monsoon VSI architecture.
- [Pillar 4: Deep Offline & Mesh Resiliency](./architecture/pillar4-offline-mesh-resiliency.md) — PMTiles v3, CivicMesh P2P, and TSP routing architecture.
- [Unified Spatial & Offline Mesh Synthesis](./architecture/unified-spatial-offline-mesh-synthesis.md) — Cross-pillar integration and verification matrix.
