# CivicLens Backend API Reference

**Base Runtime:** Express `^5.2.1` (Node.js / TypeScript)  
**Entrypoint:** [server.ts](file:///d:/projects/CivicLens/api/src/server.ts)  
**Default Port:** `process.env.PORT || 4000`

---

## 1. Server Setup, Security & Performance Middleware

The Express 5 application in [server.ts](file:///d:/projects/CivicLens/api/src/server.ts) configures middleware in the following order:

| Order | Middleware | Configuration | Purpose |
| :--- | :--- | :--- | :--- |
| 1 | `helmet()` | Default settings | Sets security-related HTTP response headers. |
| 2 | `morgan(...)` | `'combined'` when `NODE_ENV === 'production'`, `'dev'` otherwise | HTTP request logging. |
| 3 | `compression()` | Default settings | Gzip/Deflate response compression. |
| 4 | `cors(...)` | `credentials: true`; allows requests with no `Origin` header (mobile apps, `curl`, same-origin), any origin in `ALLOWED_ORIGINS`, or any origin when `NODE_ENV !== 'production'`. Rejects others with `Error('CORS blocked origin: <origin>')`. | Restricted Cross-Origin Resource Sharing. |
| 5 | `express.json(...)` | `{ limit: '10mb' }` | JSON body parser with 10 MB payload limit (accommodates offline photo metadata/data URLs). |
| 6 | `generalApiLimiter` | Mounted on `/api/`: `windowMs: 15 * 60 * 1000` (15 min), `max: 300`, `standardHeaders: true`, `legacyHeaders: false`. | General API rate limiting. |
| 7 | `authLimiter` | Mounted on `/api/auth/login` and `/api/auth/register`: `windowMs: 15 * 60 * 1000` (15 min), `max: 30`, `standardHeaders: true`, `legacyHeaders: false`, message `{ error: 'Too many authentication attempts. Please try again after 15 minutes.' }`. | Brute-force protection on auth endpoints. |
| 8 | `Cache-Control` middleware | Applies to `GET` requests whose `req.path` starts with `/api/assets`, `/api/issues`, or `/api/analytics`. Sets `Cache-Control: public, max-age=15, stale-while-revalidate=60`. | Short-lived edge/browser caching for high-frequency read endpoints. |
| 9 | Error handler | 4-argument `(err, _req, res, _next)` middleware. Logs error, uses `err.status || 500`, returns `{ error: 'Internal server error' }` in production or `err.message || 'Internal server error'` in non-production. | Centralized error handling. |

---

## 2. Configuration & Secrets

### 2.1 Database Pool ([db.ts](file:///d:/projects/CivicLens/api/src/config/db.ts))
- **Env Loading:** If `process.env.DATABASE_URL` is unset, attempts `process.loadEnvFile(resolve(__dirname, '../../../.env'))`.
- **Connection String:** `process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/civiclens'`.
- **Pool Settings:** `max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 10000`.
- **SSL Configuration:** Disabled (`false`) when `connectionString` contains `localhost` or `127.0.0.1`. Otherwise `{ rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' }`.
- **Error Listener:** Logs unexpected pool errors via `pool.on('error', ...)`.

### 2.2 Secrets & Origins ([secrets.ts](file:///d:/projects/CivicLens/api/src/config/secrets.ts))
- **Env Loading:** Attempts `process.loadEnvFile(resolve(__dirname, '../../../.env'))` if `JWT_SECRET` or `DATABASE_URL` is missing.
- **`JWT_SECRET`:**
  - In production (`NODE_ENV === 'production'`), logs a `CRITICAL SECURITY WARNING` if `JWT_SECRET` is missing or equals `'civiclens-super-secret-key-2026'`, and throws `Error('JWT_SECRET must be set in production')` if `process.env.JWT_SECRET` is unset.
  - In non-production, falls back to `'civiclens-dev-secret-key-local-only-2026'`.
- **`ALLOWED_ORIGINS`:** Comma-separated `process.env.ALLOWED_ORIGINS` if set, otherwise defaults to:
  - `http://localhost:5173`, `http://127.0.0.1:5173`
  - `http://localhost:4173`, `http://127.0.0.1:4173`
  - `https://civiclens.vercel.app`, `https://civiclens-api.onrender.com`

---

## 3. Authentication & RBAC Middleware

Defined in [auth.ts](file:///d:/projects/CivicLens/api/src/middleware/auth.ts).

```ts
export interface AuthRequest extends Request {
  user?: {
    id: number;
    phone: string;
    role: string;
    ward_id: number;
  };
}
```

- **`authenticateToken(req, res, next)`**
  - Extracts Bearer token from `Authorization: Bearer <token>`.
  - Missing token → `401 { error: 'Authentication token required' }`.
  - Invalid/expired token (`jwt.verify`) → `403 { error: 'Invalid or expired token' }`.
  - Valid token → attaches decoded payload to `req.user` and calls `next()`.
- **`optionalAuthenticateToken(req, _res, next)`**
  - Extracts Bearer token if present. If missing or invalid, proceeds without setting `req.user`. If valid, sets `req.user`.
- **`requireRole(...roles)`**
  - Must run after `authenticateToken`.
  - Missing `req.user` → `401 { error: 'Authentication required' }`.
  - `req.user.role` not in `roles` → `403 { error: 'Insufficient permissions' }`.

---

## 4. REST API Endpoints

### 4.1 Health Check

#### `GET /api/health`
- **Auth:** None (public)
- **Response `200 OK`:**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-11-25T15:19:28.000Z",
    "service": "CivicLens API"
  }
  ```

---

### 4.2 Authentication ([authController.ts](file:///d:/projects/CivicLens/api/src/controllers/authController.ts))

#### `POST /api/auth/login`
- **Auth:** None (`authLimiter`: 30 req / 15 min)
- **Request Body (`loginSchema`):**
  - `phone`: `string` (trimmed, min 5, max 20, required)
  - `password`: `string` (min 4, max 100, required)
- **Responses:**
  - `200 OK`: `{ token: string, user: { id, name, phone, role, ward_id } }` (JWT signed with `expiresIn: '30d'`)
  - `400 Bad Request`: `{ error: 'Validation failed', details: fieldErrors }`
  - `401 Unauthorized`: `{ error: 'Invalid phone or password' }`
  - `500 Internal Server Error`: `{ error: 'Internal server error' }`

#### `POST /api/auth/register`
- **Auth:** None (`authLimiter`: 30 req / 15 min)
- **Security Note:** Public self-registration always assigns `role = 'viewer'` regardless of any role field in the body, preventing privilege escalation. `ward_id` defaults to `1` if omitted.
- **Request Body (`registerSchema`):**
  - `name`: `string` (trimmed, min 2, max 100, required)
  - `phone`: `string` (trimmed, min 5, max 20, required)
  - `password`: `string` (min 4, max 100, required)
  - `ward_id`: `number` (coerced int, positive, optional; defaults to `1` on insert)
- **Responses:**
  - `201 Created`: `{ token: string, user: { id, name, phone, role, ward_id } }`
  - `400 Bad Request`: `{ error: 'Validation failed', details: fieldErrors }`
  - `409 Conflict`: `{ error: 'Phone number already registered' }` (PostgreSQL error `23505`)
  - `500 Internal Server Error`: `{ error: 'Internal server error' }`

---

### 4.3 Infrastructure Assets ([assetController.ts](file:///d:/projects/CivicLens/api/src/controllers/assetController.ts))

#### `GET /api/assets`
- **Auth:** None (sets `Cache-Control: public, max-age=15, stale-while-revalidate=60`)
- **Query Params (`queryAssetSchema`):**
  - `type`: `string` (trimmed, optional) — filters by `asset_type`
  - `ward_id`: `number` (coerced positive int, optional)
- **Responses:**
  - `200 OK`: GeoJSON `FeatureCollection`:
    ```json
    {
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "geometry": { "type": "Point", "coordinates": [77.209, 28.6139] },
          "properties": {
            "id": "uuid",
            "ward_id": 1,
            "asset_type": "handpump",
            "name": "Main Chowk Handpump",
            "lbd_asset_id": "HP-001",
            "status": "active",
            "attributes": {},
            "version_id": 1
          }
        }
      ]
    }
    ```
  - `400 Bad Request`: `{ error: 'Invalid query parameters', details: fieldErrors }`

#### `POST /api/assets`
- **Auth:** `authenticateToken` (Bearer JWT required)
- **Behavior:** Upserts into `assets` (`ON CONFLICT (id) DO UPDATE`), incrementing `version_id` and setting `updated_at = now()`.
- **Request Body (`createAssetSchema`):**
  - `id`: `string` (trimmed, min 1, required — UUID)
  - `ward_id`: `number` (coerced positive int, default `1`)
  - `asset_type`: `'road' | 'handpump' | 'overhead_tank' | 'public_toilet' | 'school' | 'anganwadi' | 'phc' | 'streetlight' | 'drainage' | 'ration_shop'` (required)
  - `name`: `string | null` (trimmed, max 200, optional)
  - `lbd_asset_id`: `string | null` (trimmed, max 100, optional)
  - `status`: `'active' | 'non_functional' | 'under_construction'` (default `'active'`)
  - `latitude`: `number` (`-90` to `90`, required)
  - `longitude`: `number` (`-180` to `180`, required)
  - `attributes`: `Record<string, any>` (optional, default `{}`)
- **Responses:**
  - `201 Created`: `{ id, asset_type, status, version_id }`
  - `400 Bad Request`: `{ error: 'Validation failed', details: fieldErrors }`

---

### 4.4 Civic Issues ([issueController.ts](file:///d:/projects/CivicLens/api/src/controllers/issueController.ts))

#### Shared `photoMetaSchema`
Used by `photos[]` and `resolution_photo_meta` (`.passthrough()` enabled):
- `data_url`: `string` (min 1, required)
- `dhash`: `string` (optional, default `''`)
- `captured_at`: `string` (optional)
- `latitude`: `number | null` (`-90` to `90`, optional)
- `longitude`: `number | null` (`-180` to `180`, optional)
- `accuracy_m`: `number | null` (`>= 0`, optional)
- `heading_deg`: `number | null` (`0` to `360`, optional)
- `location_source`: `'gps' | 'manual_pin' | null` (optional)
- `capture_source`: `'camera_native' | 'camera_webrtc'` (optional)
- `quality_warnings`: `string[]` (optional, default `[]`)

#### `GET /api/issues`
- **Auth:** `optionalAuthenticateToken` (sets `Cache-Control: public, max-age=15, stale-while-revalidate=60`)
- **PII Stripping:** Only users with `role` in `['admin', 'panchayat_officer']` receive `encrypted_phone` and `reported_by`. For unauthenticated or other roles, those fields are `undefined` (omitted from JSON).
- **Query Params (`queryFilterSchema`):**
  - `category`: `string` (trimmed, optional)
  - `status`: `'open' | 'in_progress' | 'resolved'` (optional)
  - `ward_id`: `number` (coerced positive int, optional)
- **Responses:**
  - `200 OK`: GeoJSON `FeatureCollection` where each feature's `properties` contains:
    `id`, `asset_id`, `ward_id`, `category`, `severity`, `description`, `photo_url`, `photos` (default `[]`), `gps_accuracy_m` (default `null`), `heading_deg` (default `null`), `location_source` (default `'gps'`), `resolution_photo_url` (default `null`), `resolution_photo_meta` (default `null`), `encrypted_phone` (PII-gated), `status`, `reported_by` (PII-gated), `assigned_officer`, `version_id`, `client_seq_num`, `server_received_at`, `date_reported`, `date_resolved`.
  - `400 Bad Request`: `{ error: 'Invalid query parameters', details: fieldErrors }`

#### `POST /api/issues`
- **Auth:** `authenticateToken`
- **Behavior:** Upserts into `issues` (`ON CONFLICT (id) DO UPDATE`), sets `reported_by = req.user.id`, `client_seq_num = client_seq_num || Date.now()`, `effectivePhotoUrl = photo_url || photos?.[0]?.data_url || null`, `effectiveResolutionPhotoUrl = resolution_photo_url || resolution_photo_meta?.data_url || null`, increments `version_id` on conflict.
- **Request Body (`createIssueSchema`):**
  - `id`: `string` (trimmed, min 1, required — UUID)
  - `asset_id`: `string | null` (trimmed, optional)
  - `ward_id`: `number` (coerced positive int, default `1`)
  - `category`: `string` (trimmed, min 1, required)
  - `severity`: `'low' | 'medium' | 'high' | 'critical'` (default `'medium'`)
  - `description`: `string` (max 3000, default `''`)
  - `photo_url`: `string | null` (optional)
  - `photos`: `photoMetaSchema[]` (max 3, optional)
  - `gps_accuracy_m`: `number | null` (`>= 0`, optional)
  - `heading_deg`: `number | null` (`0` to `360`, optional)
  - `location_source`: `'gps' | 'manual_pin'` (optional)
  - `resolution_photo_url`: `string | null` (optional)
  - `resolution_photo_meta`: `photoMetaSchema | null` (optional)
  - `encrypted_phone`: `string | null` (optional)
  - `latitude`: `number` (`-90` to `90`, required)
  - `longitude`: `number` (`-180` to `180`, required)
  - `client_seq_num`: `number` (optional)
- **Responses:**
  - `201 Created`: `{ id, category, severity, status, photo_url, photos, gps_accuracy_m, heading_deg, location_source, resolution_photo_url, resolution_photo_meta, version_id, server_received_at }`
  - `400 Bad Request`: `{ error: 'Validation failed', details: fieldErrors }`

#### `PATCH /api/issues/:id/status`
- **Auth:** `authenticateToken` + `requireRole('admin', 'panchayat_officer')`
- **Path Params:** `id` (Issue UUID)
- **Request Body (`updateStatusSchema`):**
  - `status`: `'open' | 'in_progress' | 'resolved'` (required)
  - `assigned_officer`: `string` (trimmed, max 200, optional)
  - `resolution_photo_url`: `string | null` (optional)
  - `resolution_photo_meta`: `photoMetaSchema | null` (optional)
- **Behavior:** Sets `date_resolved = now()` when `status === 'resolved'`, else `NULL`. Updates `resolution_photo_url` and `resolution_photo_meta` only when `status === 'resolved'` (preserving existing values if null). Increments `version_id`.
- **Responses:**
  - `200 OK`: `{ id, category, status, assigned_officer, resolution_photo_url, resolution_photo_meta, version_id, date_resolved }`
  - `400 Bad Request`: Missing ID or validation failure
  - `404 Not Found`: `{ error: 'Issue not found' }`

---

### 4.5 Spatial Intelligence & Computer Vision ([spatialController.ts](file:///d:/projects/CivicLens/api/src/controllers/spatialController.ts))

#### `POST /api/issues/check-duplicates`
- **Auth:** `optionalAuthenticateToken`
- **Request Body (`checkDuplicatesSchema`):**
  - `latitude`: `number` (`-90` to `90`, required)
  - `longitude`: `number` (`-180` to `180`, required)
  - `category`: `string` (trimmed, optional)
  - `radius_meters`: `number` (positive, max 500, default `30.0`)
  - `limit`: `number` (int, positive, max 20, default `5`)
- **Responses:**
  - `200 OK`:
    ```json
    {
      "hasDuplicates": true,
      "duplicateCount": 1,
      "radiusMeters": 30,
      "duplicates": [ /* DuplicateIssueMatch[] */ ]
    }
    ```
  - `400 Bad Request`: `{ error: 'Validation failed', details: fieldErrors }`
  - `500 Internal Server Error`: `{ error: 'Failed to query duplicate issues' }`

#### `POST /api/issues/:id/corroborate`
- **Auth:** `optionalAuthenticateToken`
- **Path Params:** `id` (Issue UUID)
- **Request Body (`corroborateSchema`):**
  - `action_type`: `'upvote' | 'corroborate_still_present' | 'severity_worsened' | 'fixed_by_community'` (default `'upvote'`)
  - `notes`: `string` (max 1000, optional)
  - `photo_url`: `string` (valid URL, max 1024, optional; rejects raw base64)
  - `latitude`: `number` (`-90` to `90`, required)
  - `longitude`: `number` (`-180` to `180`, required)
  - `device_fingerprint`: `string` (max 128, optional)
- **Responses:**
  - `200 OK`: `{ message: 'Issue successfully corroborated', success: true, corroboration_id, issue_id, new_corroboration_count, new_priority_score, new_severity }`
  - `400 Bad Request`: Missing ID or validation failure
  - `409 Conflict`: When error message includes `'already corroborated'` (duplicate user upvote or same `device_fingerprint` within 24 hours)
  - `500 Internal Server Error`: `{ error: message }` (e.g., issue not found or already resolved)

#### `POST /api/cv/classify-issue`
- **Auth:** `optionalAuthenticateToken`
- **Request Body (`classifyPhotoSchema`):**
  - `imageBytesOrBase64`: `string` (optional)
  - `claimedCategory`: `string` (trimmed, optional)
  - `precomputedFeatures`: `{ damageAreaRatio?: number (0..1), edgeRoughness?: number (0..1), waterStagnant?: boolean, dHash?: string (length 16) }` (optional)
  - `exif`: `{ hasGps: boolean, latitude?: number, longitude?: number, captureTimestamp?: string, cameraModel?: string, isLikelyLiveCapture: boolean }` (optional)
- **Responses:**
  - `200 OK`: `{ success: true, analysis: VisionClassificationResult }`
  - `400 Bad Request`: `{ error: 'Validation failed', details: fieldErrors }`
  - `500 Internal Server Error`: `{ error: 'Computer vision analysis failed' }`

---

### 4.6 Analytics ([analyticsController.ts](file:///d:/projects/CivicLens/api/src/controllers/analyticsController.ts) & [spatialController.ts](file:///d:/projects/CivicLens/api/src/controllers/spatialController.ts))

All `GET /api/analytics/*` routes receive `Cache-Control: public, max-age=15, stale-while-revalidate=60`.

#### `GET /api/analytics/summary`
- **Auth:** None
- **Query Params (`wardQuerySchema`):** `ward_id` (coerced positive int, default `1`; invalid values silently fall back to `1`)
- **Behavior:** Runs 4 parallel `GROUP BY` queries for the given `ward_id`.
- **Response `200 OK`:**
  ```json
  {
    "ward_id": 1,
    "assets": [{ "asset_type": "handpump", "count": "2" }],
    "issues_by_category": [{ "category": "Water Supply", "count": "1" }],
    "issues_by_status": [{ "status": "open", "count": "2" }],
    "issues_by_severity": [{ "severity": "high", "count": "1" }]
  }
  ```

#### `GET /api/analytics/coverage-gaps`
- **Auth:** None
- **Query Params (`coverageGapsQuerySchema`):**
  - `ward_id`: `number` (coerced positive int, default `1`)
  - `distance_m`: `number` (coerced int, `1`–`5000`, default `500`)
- **Behavior:** Finds `school`, `anganwadi`, and `phc` assets in `ward_id` with no `active` `handpump` within `distance_m` meters using `ST_DWithin(s.location::geography, h.location::geography, $2)`.
- **Responses:**
  - `200 OK`: GeoJSON `FeatureCollection` with `properties: { id, name, type, gap_type: "No active handpump within <distance_m>m" }`.
  - `400 Bad Request`: `{ error: 'Invalid query parameters', details: fieldErrors }`

#### `GET /api/analytics/hotspots`
- **Auth:** None
- **Query Params (`wardQuerySchema`):** `ward_id` (coerced positive int, default `1`)
- **Behavior:** Groups unresolved issues (`status != 'resolved'`) by `ST_SnapToGrid(location, 0.005)`, computing `ST_Centroid(ST_Collect(location))` and `peak_severity` (`critical` > `high` > `medium` > `low`).
- **Response `200 OK`:** GeoJSON `FeatureCollection` with `properties: { cluster_id, count, peak_severity }`.

#### `GET /api/analytics/monsoon-vulnerability`
- **Auth:** `optionalAuthenticateToken`
- **Query Params (`monsoonQuerySchema`):**
  - `ward_id`: `number` (coerced positive int, default `1`)
  - `min_risk`: `'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW'` (optional — filters features where `risk_level === min_risk.toUpperCase()`)
- **Responses:**
  - `200 OK`:
    ```json
    {
      "type": "FeatureCollection",
      "ward_id": 1,
      "total_hotspots": 2,
      "critical_hotspots": 1,
      "features": [ /* GeoJSON Polygon features with VSI properties */ ]
    }
    ```
  - `400 Bad Request`: `{ error: 'Invalid query parameters', details: fieldErrors }`

---

### 4.7 Offline Sync Outbox ([syncController.ts](file:///d:/projects/CivicLens/api/src/controllers/syncController.ts))

#### `POST /api/sync`
- **Auth:** `authenticateToken`
- **Request Body (`syncBatchSchema`):**
  - `batch`: Array (min `1`, max `100`) of `syncItemSchema`:
    - `id`: `number` (optional)
    - `record_id`: `string` (trimmed, min 1, required — UUID)
    - `table_name`: `'assets' | 'issues'` (required)
    - `action`: `'create' | 'update' | 'delete'` (required)
    - `payload`: `Record<string, any>` (required)
    - `client_seq_num`: `number` (optional, default `Date.now()`)
- **Conflict Resolution & Arbitration:**
  - **`delete`:** Deletes row from `issues` or `assets` by `id`.
  - **`issues` upsert:** Requires `latitude`, `longitude`, `category`. If existing issue has `status === 'resolved'` and incoming `status === 'open'`, logs to `sync_conflicts` (`'Client reopened a resolved issue offline'`) and returns `conflict_logged`. Otherwise upserts and sets `date_resolved` if `status === 'resolved'`.
  - **`assets` upsert:** Requires `latitude`, `longitude`, `asset_type`. If existing asset has `version_id > payload.version_id`, logs to `sync_conflicts` (`'Client version is behind server version'`) and returns `conflict_logged`. Otherwise upserts and increments `version_id`.
- **Responses:**
  - `200 OK`:
    ```json
    {
      "processed_count": 2,
      "acks": [
        { "record_id": "...", "status": "synced" },
        { "record_id": "...", "status": "conflict_logged" },
        { "record_id": "...", "status": "error", "error": "..." }
      ],
      "server_timestamp": "2026-11-25T15:19:28.000Z"
    }
    ```
  - `400 Bad Request`: `{ error: 'Invalid sync batch', details: fieldErrors }`

---

## 5. Service Layer

### 5.1 `spatialDedupService.ts` ([spatialDedupService.ts](file:///d:/projects/CivicLens/api/src/services/spatialDedupService.ts))
- **`haversineDistanceMeters(lat1, lon1, lat2, lon2)`**: Pure spherical distance in meters (Earth radius `6371000` m, rounded to 2 decimals).
- **`calculateBearingDegrees(lat1, lon1, lat2, lon2)`**: Pure bearing (`0`–`360`, 1 decimal). Returns `null` if distance `< 1.0` m (collocation guard).
- **`calculatePriorityScore(severity, corroborationCount, hasNearbyVulnerableAsset = false)`**:
  - Base score: `critical` = `75`, `high` = `55`, `medium` = `35`, `low` = `15` (default `35`).
  - Upvote bonus: `min(25, log2(max(1, corroborationCount) + 1) * 5)`.
  - Proximity bonus: `+15` if `hasNearbyVulnerableAsset` is `true`.
  - Capped at `100.0`, rounded to 2 decimals.
- **`findDuplicateIssues(params)`**: Queries `issues` where `status IN ('open', 'in_progress')` and `ST_DWithin(location::geography, ..., radius_meters)`. Computes `distance_meters`, `bearing_degrees` (NULL within 1m), and `category_match_score` (`1.00` exact case-insensitive match, `0.80` `ILIKE` substring match, `0.50` otherwise). Ordered by `category_match_score DESC, distance_meters ASC`.
- **`corroborateIssue(params)`**: Transactional (`BEGIN`/`COMMIT`/`ROLLBACK`):
  1. Locks/reads issue and computes `distance_meters` from user coordinates. Fails if not found or `status === 'resolved'`.
  2. Anti-fraud check: rejects if `user_id` already in `issue_corroborations` for `issue_id`, or if anonymous `device_fingerprint` corroborated within the past 24 hours.
  3. Inserts into `issue_corroborations`.
  4. Increments `corroboration_count`. If `action_type === 'severity_worsened'`, escalates `low` → `medium`, `medium` → `high`, or `high` → `critical` (when `newCount >= 3`).
  5. Recomputes `priority_score` using cached `near_vital_asset` (zero runtime spatial joins) and updates `issues`.

### 5.2 `visionService.ts` ([visionService.ts](file:///d:/projects/CivicLens/api/src/services/visionService.ts))
- **`computeDHashFromGrayscale(pixels9x8)`**: Pure JS 64-bit difference hash over a `9x8` luminance array (`>= 72` values); returns 16-char zero-padded hex string.
- **`calculateHammingDistance(hash1, hash2)`**: Bitwise XOR popcount between two 16-char hex strings (`<= 6` indicates near-identical image).
- **`calculateVisualSeverity(category, damageAreaRatio, waterStagnant, edgeRoughness)`**: Heuristic scoring (`5`–`100`) producing `severityScore`, `severityLevel` (`>=80` `critical`, `>=58` `high`, `>=35` `medium`, else `low`), and `hazardFlags` (`WATERBORNE_DISEASE_VECTOR`, `OVERFLOW_WATERLOGGING_RISK`, `SUBMERGED_POTHOLE_COLLAPSE_HAZARD`, `ROAD_TRANSIT_DISRUPTION`, `MAJOR_SOLID_WASTE_ACCUMULATION`, `NIGHT_SAFETY_ELECTRICAL_CHECK`).
- **`validateCaptureAuthenticity(exif?)`**: Flags `isAuthentic: false` if `exif.captureTimestamp` is more than 30 days (`24 * 30` hours) old. Permissive (`isAuthentic: true`) when `exif` is omitted.
- **`classifyRuralIssuePhoto(input)`**: Thin API classifier mapping `claimedCategory` keywords (`handpump`/`water`/`pump`, `garbage`/`waste`/`dump`, `drain`/`nalla`/`sewer`, `light`/`electric`/`pole`, `pothole`/`road`, fallback `other_civic`) and applying `precomputedFeatures` (defaults: `damageAreaRatio = 0.38`, `edgeRoughness = 0.42`, `waterStagnant = false`, `dHash = 'a1b2c3d4e5f60718'`). Sets `requiresHumanReview = confidence < 0.75`.

### 5.3 `waterloggingService.ts` ([waterloggingService.ts](file:///d:/projects/CivicLens/api/src/services/waterloggingService.ts))
- **`calculateVulnerabilityScoringIndex(params)`**: Computes weighted VSI (`0`–`100`):
  - **Topographic Depression (35%):** `>=1.0m` → `100`, `>=0.5m` → `75`, `>=0.2m` → `50`, else `20`.
  - **Drainage Deficit & Choke (30%):** `no_drain` or `>150m` → `90`; `severely_choked`/`damaged` → `95`; `partially_silted` → `65`; `>50m` → `45`; else `15`.
  - **Soil Permeability (15%):** `impermeable_paved` → `90`, `clayey_black_cotton` → `80`, `alluvial_loam` → `45`, `sandy_porous` → `20`.
  - **Historical Recurrence (20%):** `min(100, historicalWaterloggingIssueCount * 25)`.
  - Risk levels: `>=75` `CRITICAL`, `>=55` `HIGH`, `>=35` `MODERATE`, else `LOW`, each with a `recommendedAction`.
- **`getMonsoonWaterloggingAnalysis(wardId, minRiskLevel?)`**: Executes a PostGIS CTE query joining `topographic_depressions` with nearest `drainage_lines` (via `LATERAL ... ORDER BY td.geom <-> geom LIMIT 1`), nearby water/drain/flood `issues` (`ST_DWithin(..., 30.0)`), and intersecting `assets` (`ST_Intersects`). Returns `{ ward_id, total_hotspots, critical_hotspots, features }` (with graceful empty fallback on query error).
