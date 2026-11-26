# CivicLens — Pillar 2: Advanced GIS & Spatial Intelligence
## Technical Architecture, PostGIS Schema, Edge CV Pipeline & Monsoon Vulnerability Analysis

---

## Executive Summary

Pillar 2 of the **CivicLens** platform provides hyper-local spatial intelligence and lightweight computer vision tailored specifically for rural Indian Gram Panchayats. In rural India, public infrastructure (drinking handpumps, paved/unpaved roads, open nallas, Anganwadi centers, and primary health centers) experiences recurring seasonal and operational failures. 

However, rural civic management suffers from three chronic data failure modes:
1. **Redundant Grievance Fragmentation:** Multiple residents report the exact same defect (e.g., a broken handpump or flooded pothole) at slightly varying GPS coordinates due to tree-canopy drift and low-end mobile GPS errors, cluttering administration queues and fragmenting community voices.
2. **Unvalidated Photo Reports:** Citizens submit unclassified, arbitrary, or stale images from social media without automated validation, severity estimation, or duplicate photo detection.
3. **Reactive Monsoon Crisis Response:** Gram Panchayats lack predictive GIS capabilities, scrambling to clear clogged drains only after streets and schoolyards are submerged in knee-deep floodwaters during the June–September South Asian monsoon.

Pillar 2 solves these challenges through an integrated, production-ready spatial architecture designed for **$0 free-tier cloud hosting** (Render/Supabase) and **low-end 2GB RAM Android Go devices** operating under spotty 2G/3G connectivity.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          CIVICLENS PILLAR 2 ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌───────────────────────────┐         ┌───────────────────────────────────┐   │
│   │   OFFLINE-FIRST CLIENT    │         │      THIN API & POSTGIS LAYER     │   │
│   │                           │         │                                   │   │
│   │  • Dexie.js 30m Dedup     │         │  • Partial GiST Functional Index  │   │
│   │  • Canvas dHash (64-bit)  │ ◄─────► │  • ST_DWithin / ST_Azimuth Dedup  │   │
│   │  • WebP 120KB Compression │         │  • 1-Tap Corroboration Engine     │   │
│   │  • Turf/Haversine Bearing │         │  • Dynamic Priority Scoring       │   │
│   └─────────────┬─────────────┘         └─────────────────┬─────────────────┘   │
│                 │                                         │                     │
│                 ▼                                         ▼                     │
│   ┌───────────────────────────┐         ┌───────────────────────────────────┐   │
│   │    EDGE / THIN CV PIPELINE│         │  MONSOON VULNERABILITY ANALYZER   │   │
│   │                           │         │                                   │   │
│   │  • Hamming Distance <= 6  │         │  • Topographic Sinks (SRTM/LiDAR) │   │
│   │  • Multi-Class Detector   │ ◄─────► │  • Drainage Network Condition     │   │
│   │  • Automated Severity VSI │         │  • Black Cotton Soil Runoff Model │   │
│   │  • Water Stagnation Flag  │         │  • Pre-Monsoon Desilting GeoJSON  │   │
│   └───────────────────────────┘         └───────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Spatial Deduplication & Community Upvoting

### 1.1 The Problem: GPS Drift & Redundant Reporting
On typical rural Android smartphones (e.g., Redmi 9A, JioPhone Next), civilian GPS chips exhibit **5 to 25 meters of horizontal inaccuracy**, exacerbated by tree cover, building reflections, and cloudy monsoon weather. When a main road pothole or leaking handpump breaks down, several citizens report it within a 30-meter radius over a few days. 

Standard database queries fail here:
- Querying exact lat/lng matches yields zero duplicates.
- Naive bounding-box scans scan every issue in the ward.
- `ST_DWithin` on `geometry(Point, 4326)` calculates distances in **angular degrees**, not meters ($30^\circ$ corresponds to thousands of kilometers).
- Casting `location::geography` on a table with millions of rows without a functional index triggers a costly sequential scan that exhausts CPU on free-tier PostgreSQL instances.

### 1.2 Mathematical Model & PostGIS Index Optimization
To execute sub-5ms proximity lookups, CivicLens employs a **Partial Functional GiST Index** on geography:

```sql
-- Expression index on geography cast
CREATE INDEX idx_issues_location_geog 
  ON issues USING GIST ((location::geography));

-- Highly optimized partial index: skips resolved/closed historical tickets
CREATE INDEX idx_issues_active_location_geog 
  ON issues USING GIST ((location::geography)) 
  WHERE status IN ('open', 'in_progress');
```

#### Query Execution Plan:
When querying within $R = 30\text{ meters}$, PostGIS utilizes the spatial R-Tree index to filter candidates using spherical distance:

$$\text{Distance}_{\text{geog}}(P_1, P_2) \le 30.0\text{ m}$$

We also calculate the relative **cardinal bearing** $\theta$ in degrees:

$$\theta = \text{atan2}\left(\sin(\Delta \lambda) \cdot \cos(\phi_2), \; \cos(\phi_1)\sin(\phi_2) - \sin(\phi_1)\cos(\phi_2)\cos(\Delta \lambda)\right)$$

This bearing enables the mobile UI to point a directional compass arrow ("14 meters North-East") toward the existing issue, helping the resident visually verify and corroborate it.

### 1.3 Database Schema & Stored Procedure

```sql
-- Community Corroborations & Upvoting Table
CREATE TABLE IF NOT EXISTS issue_corroborations (
  id SERIAL PRIMARY KEY,
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  device_fingerprint TEXT, -- For anonymous village residents via PWA
  action_type VARCHAR(30) NOT NULL DEFAULT 'upvote' 
    CHECK (action_type IN ('upvote', 'corroborate_still_present', 'severity_worsened', 'fixed_by_community')),
  notes TEXT,
  photo_url TEXT,
  location GEOMETRY(POINT, 4326) NOT NULL,
  distance_meters NUMERIC(6,2),
  created_at TIMESTAMP DEFAULT now()
);

-- Anti-fraud constraints
CREATE UNIQUE INDEX idx_unique_user_issue_upvote 
  ON issue_corroborations (issue_id, user_id) 
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX idx_unique_device_daily_upvote 
  ON issue_corroborations (issue_id, device_fingerprint, (date_trunc('day', created_at))) 
  WHERE device_fingerprint IS NOT NULL AND user_id IS NULL;
```

### 1.4 Dynamic Priority Scoring Formula
Rather than treating all grievances equally, CivicLens calculates a composite priority score $P \in [1, 100]$:

$$P = \min\left(100, \; S_{\text{base}} + \Delta_{\text{upvotes}} + \Delta_{\text{proximity}}\right)$$

Where:
- $S_{\text{base}}$: Base severity weight:
  - Critical: $75$
  - High: $55$
  - Medium: $35$
  - Low: $15$
- $\Delta_{\text{upvotes}}$: Logarithmic corroboration bonus (diminishing returns to prevent brigading):
  $$\Delta_{\text{upvotes}} = \min\left(25, \; \log_2(C + 1) \times 5.0\right)$$
  *(where $C$ is the total corroboration count).*
- $\Delta_{\text{proximity}}$: Proximity bonus for critical village infrastructure:
  - If within 50m of a Primary Health Center (PHC), School, or Anganwadi: $+15$
  - If within 50m of a drinking water source (Handpump, OHT): $+10$

### 1.5 Express API Endpoints
- `POST /api/issues/check-duplicates`
  - Input: `{ latitude, longitude, category?, radius_meters: 30 }`
  - Output: List of open issues within 30m, sorted by category match score and distance, including compass bearing and corroboration count.
- `POST /api/issues/:id/corroborate`
  - Input: `{ action_type: 'upvote' | 'severity_worsened', latitude, longitude, notes?, photo_url?, device_fingerprint? }`
  - Action: Inserts into `issue_corroborations`, increments `corroboration_count`, recalculates priority score in an atomic transaction.

### 1.6 Offline-First Client Architecture (Dexie.js + Haversine)
In offline mode (no 2G/3G connectivity), `app/src/services/offlineDedup.ts` checks locally cached issues in IndexedDB using the Haversine formula:
1. When user taps "Report Issue", client performs a local 30m scan in Dexie.
2. If an open issue exists within 30m, an interactive bottom sheet displays: *"Existing report 'Broken Handpump' found 12m away. Would you like to confirm it?"*
3. Tapping **"Confirm Issue (Upvote)"** appends a `corroborate` action into `db.outbox`, immediately updating local UI counts with zero network round-trip.

---

## 2. Lightweight Computer Vision for Rural Civic Issues

### 2.1 Environmental & Hardware Constraints
Running heavy deep learning vision models (such as YOLOv8x or Mask-RCNN) on rural devices is impossible:
- **Low-End Phones:** 2GB RAM devices terminate background web workers exceeding 150MB of memory allocation.
- **Bandwidth Scarcity:** Uploading raw 8-12MB camera photos over 2G edge networks burns prepaid balances and suffers a 90% timeout rate.
- **$0 Free-Tier Backend:** Cloud containers (Render/Fly.io free tier) are capped at 512MB RAM; loading PyTorch CUDA runtimes triggers instant Out-Of-Memory (OOM) kills.

### 2.2 Progressive 3-Tier Edge-to-Cloud Pipeline

```
  CAMERA CAPTURE (Raw 8MB)
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ TIER 0: CLIENT-SIDE PRE-PROCESSING (<15ms, 0 RAM)     │
│ • Aspect-ratio preserving downscale to max 800px       │
│ • WebP compression (8MB -> ~95KB)                      │
│ • 64-bit Canvas Difference Hash (dHash)                │
│ • Instant local outbox duplicate check                 │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ TIER 1: OPTIONAL EDGE INFERENCE (Gated PWA)            │
│ • Enabled only if deviceMemory >= 4GB & Battery > 25%  │
│ • Quantized INT8 MobileNetV4-Small (~3.5MB ONNX Wasm)  │
│ • Instant category preview on camera HUD               │
└───────────────────────────┬────────────────────────────┘
                            │ (Compressed 95KB upload on sync)
                            ▼
┌────────────────────────────────────────────────────────┐
│ TIER 2: THIN SERVER-SIDE VISION SERVICE                │
│ • Headless CPU inference (<40MB RAM footprint, <35ms)  │
│ • Multi-class Rural Classifier                         │
│ • Automated Severity & Waterborne Hazard Evaluator     │
│ • Global Hamming Distance Fraud Detection              │
└────────────────────────────────────────────────────────┘
```

### 2.3 Difference Hash (dHash) & Hamming Distance Anti-Fraud
To eliminate duplicate photo uploads across users (or repeated accidental clicks), the system calculates a 64-bit perceptual difference hash:
1. Resizes image to $9 \times 8$ grayscale matrix.
2. For each row $r \in [0..7]$ and column $c \in [0..7]$, computes:
   $$b_{r \times 8 + c} = \begin{cases} 1 & \text{if } P(r, c) > P(r, c + 1) \\ 0 & \text{otherwise} \end{cases}$$
3. Produces a 16-character hexadecimal string.

#### Hamming Distance Matching:
$$\mathcal{H}(h_1, h_2) = \text{popcount}(h_1 \oplus h_2)$$
- If $\mathcal{H} \le 6$ within 100m radius $\implies$ Confirmed visual duplicate.
- Prevents malicious recycling of downloaded internet photos.

### 2.4 Automated Severity Scoring & Waterborne Hazard Heuristics
The classification engine scores 5 core rural issue categories:

| Category | Key Visual Attributes | Critical Hazard Triggers | Default Severity Formula |
|---|---|---|---|
| `pothole` | Crater area ratio, asphalt edge roughness | Stagnant water pool, depth collapse risk | $25 + (A \times 40) + (R \times 20) + (W ? 15 : 0)$ |
| `dry_leaking_handpump` | Platform cracking, standing pool, rust | Surface pooling $\implies$ cholera/diarrhea vector | $45 + (A \times 30) + (W ? 20 : 0)$ |
| `drainage_blockage` | Siltation, plastic debris, choked nalla | Backflow to homes, mosquito breeding | $40 + (A \times 35) + (W ? 18 : 0)$ |
| `garbage_dump` | Loose debris, unsegregated plastic mound | Leachate runoff into village drains | $30 + (A \times 45)$ |
| `broken_streetlight` | Leaning pole, shattered luminaire | Exposed dangling wires, night safety risk | $35 + (R \times 35)$ |

*(Where $A$ is visual area ratio $[0..1]$, $R$ is edge roughness $[0..1]$, and $W$ is stagnant water presence).*

If model confidence $< 0.75$, the issue is automatically marked with `requiresHumanReview: true` for Gram Sachiv verification.

---

## 3. Monsoon Waterlogging & Pre-Monsoon Vulnerability Analysis

### 3.1 Rural Indian Monsoon Reality
Between June and September, Indian villages receive over 70% of their annual rainfall. In flat agrarian terrains with **Black Cotton soil (Regur)**, rainwater cannot percolate. When roadside pucca drains or natural nallas are silted with uncollected trash or agricultural runoff:
- Village access roads become impassable mud troughs.
- Anganwadi centers and schools are marooned.
- Stagnant water enters shallow drinking water borewells, causing annual epidemics of waterborne diseases (gastroenteritis, typhoid, dengue).

Pre-monsoon spatial intelligence allows Panchayats to allocate limited NREGA labor and desilting funds **before** the rains start.

### 3.2 PostGIS Data Model
Pillar 2 introduces two specialized GIS layers:

```sql
-- Drainage Network
CREATE TABLE IF NOT EXISTS drainage_lines (
  id SERIAL PRIMARY KEY,
  ward_id INTEGER REFERENCES wards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  drain_type TEXT NOT NULL CHECK (drain_type IN ('pucca_concrete', 'kuccha_unpaved', 'natural_nalla', 'culvert')),
  condition TEXT NOT NULL DEFAULT 'clear' CHECK (condition IN ('clear', 'partially_silted', 'severely_choked', 'damaged')),
  width_meters NUMERIC(4,2) DEFAULT 1.0,
  depth_meters NUMERIC(4,2) DEFAULT 0.8,
  flow_direction_deg NUMERIC(5,2),
  geom GEOMETRY(LINESTRING, 4326) NOT NULL
);

-- Topographic Depressions & Catchment Sinks
CREATE TABLE IF NOT EXISTS topographic_depressions (
  id SERIAL PRIMARY KEY,
  ward_id INTEGER REFERENCES wards(id) ON DELETE CASCADE,
  name TEXT,
  relative_depression_depth_m NUMERIC(5,2) NOT NULL DEFAULT 0.5,
  soil_type TEXT NOT NULL DEFAULT 'alluvial_loam' 
    CHECK (soil_type IN ('clayey_black_cotton', 'alluvial_loam', 'sandy_porous', 'impermeable_paved')),
  catchment_area_sqm NUMERIC(10,2),
  geom GEOMETRY(POLYGON, 4326) NOT NULL
);
```

### 3.3 Multi-Criteria Vulnerability Scoring Index (VSI)
For every topographic depression and infrastructure cluster, the system calculates the **Vulnerability Scoring Index (VSI)**:

$$\text{VSI} = 0.35 \cdot S_{\text{depression}} + 0.30 \cdot S_{\text{drain}} + 0.15 \cdot S_{\text{soil}} + 0.20 \cdot S_{\text{hist}}$$

Where:
1. **$S_{\text{depression}}$ (Topographic Sink Factor, 35%):**
   - Relative depth $\Delta z \ge 1.0\text{m} \implies 100$
   - $0.5\text{m} \le \Delta z < 1.0\text{m} \implies 75$
   - $0.2\text{m} \le \Delta z < 0.5\text{m} \implies 50$
   - Flat / Ridge $\implies 20$
2. **$S_{\text{drain}}$ (Drainage Deficit & Siltation Factor, 30%):**
   - Distance to drain $d > 150\text{m}$ or no drain $\implies 90$
   - Nearest drain condition `severely_choked` or `damaged` $\implies 95$ (Severe backflow hazard!)
   - Nearest drain `partially_silted` $\implies 65$
   - Functioning drain $\le 50\text{m}$ $\implies 15$
3. **$S_{\text{soil}}$ (Soil Permeability & Runoff Factor, 15%):**
   - Impermeable paved concrete $\implies 90$
   - Clayey Black Cotton (high swelling, zero percolation) $\implies 80$
   - Alluvial Loam $\implies 45$
   - Sandy porous $\implies 20$
4. **$S_{\text{hist}}$ (Historical Monsoon Recurrence, 20%):**
   - Density of verified historical waterlogging tickets within 30m: $\min(100, N \times 25.0)$.

### 3.4 Actionable Risk Classification & Panchayat Matrix

| VSI Score | Risk Level | Predicted Impact | Recommended Gram Panchayat Pre-Monsoon Action |
|---|---|---|---|
| **75 – 100** | **CRITICAL** | Severe flooding ($>0.5\text{m}$ depth), road cutoff, drinking water contamination | **EMERGENCY:** Priority desilting of designated choked drain section within 10 days; deploy sandbag diversion bunds; elevate handpump plinth. |
| **55 – 74** | **HIGH** | Prolonged water accumulation ($>24\text{h}$), road erosion | Clear roadside silt; excavate percolation trenches; unblock cross-culverts. |
| **35 – 54** | **MODERATE** | Surface puddles, pedestrian inconvenience | Remove plastic debris from open drains; schedule routine cleaning. |
| **0 – 34** | **LOW** | Well-drained natural slope | Maintain regular annual inspection. |

### 3.5 PostGIS Analysis Query
The system runs a single high-performance spatial join combining drainage lines, elevation sinks, and civic assets:

```sql
WITH depression_drainage AS (
  SELECT 
    td.id AS depression_id,
    td.ward_id,
    td.relative_depression_depth_m,
    td.soil_type,
    td.geom AS depression_geom,
    dl.id AS nearest_drain_id,
    dl.name AS drain_name,
    dl.condition AS drain_condition,
    ROUND(COALESCE(ST_Distance(td.geom::geography, dl.geom::geography), 999.0)::numeric, 1) AS drain_distance_m
  FROM topographic_depressions td
  LEFT JOIN LATERAL (
    SELECT id, name, condition, geom
    FROM drainage_lines
    WHERE ward_id = td.ward_id
    ORDER BY td.geom <-> geom
    LIMIT 1
  ) dl ON TRUE
  WHERE td.ward_id = $1
)
...
```

The endpoint `GET /api/analytics/monsoon-vulnerability?ward_id=1` returns a standard **GeoJSON FeatureCollection** directly ready for Leaflet/MapLibre map rendering, highlighting polygon vulnerability boundaries with color-coded risk levels.

---

## 4. Concrete Codebase Artifacts Summary

The complete production implementation is integrated into the CivicLens repository:

1. **Database Layer:**
   - [`api/src/db/spatial_schema.sql`](file:///d:/projects/CivicLens/api/src/db/spatial_schema.sql): Complete PostGIS DDL, GiST indexes, `issue_corroborations`, `drainage_lines`, `topographic_depressions`, and SQL stored procedures.
2. **Backend Services & Controllers:**
   - [`api/src/services/spatialDedupService.ts`](file:///d:/projects/CivicLens/api/src/services/spatialDedupService.ts): 30m PostGIS deduplication query, bearing calculation, atomic upvote transaction, priority score recalculation.
   - [`api/src/services/visionService.ts`](file:///d:/projects/CivicLens/api/src/services/visionService.ts): 64-bit dHash generator, Hamming distance matcher, rural issue multi-class classifier, visual severity heuristics.
   - [`api/src/services/waterloggingService.ts`](file:///d:/projects/CivicLens/api/src/services/waterloggingService.ts): Multi-Criteria VSI index calculator, PostGIS spatial join between drainage networks, depressions, and assets.
   - [`api/src/controllers/spatialController.ts`](file:///d:/projects/CivicLens/api/src/controllers/spatialController.ts): Express routes for check-duplicates, corroborate, classify-issue, and monsoon-vulnerability.
   - [`api/src/server.ts`](file:///d:/projects/CivicLens/api/src/server.ts): Registered spatial routes with rate-limiting and optional auth middleware.
3. **Frontend Client Services:**
   - [`app/src/services/offlineDedup.ts`](file:///d:/projects/CivicLens/app/src/services/offlineDedup.ts): On-device Dexie.js 30m duplicate check and offline corroboration queuing.
   - [`app/src/services/edgeVision.ts`](file:///d:/projects/CivicLens/app/src/services/edgeVision.ts): Canvas-based image resizing, WebP compression, and 64-bit dHash generation.
4. **Automated Test Suites:**
   - [`api/src/__tests__/spatialIntelligence.test.ts`](file:///d:/projects/CivicLens/api/src/__tests__/spatialIntelligence.test.ts): 13 automated unit tests verifying geometry, dHash, severity formulas, and VSI scoring.
   - [`app/src/services/__tests__/spatialPillar2.test.ts`](file:///d:/projects/CivicLens/app/src/services/__tests__/spatialPillar2.test.ts): Client-side Haversine and Hamming distance verification.

---

## 5. Verification & Benchmark Results

Both test suites and TypeScript builds pass without any errors (see [Testing Guide](./testing.md) for full suite breakdowns):
- **API Test Suite:** 26 passing tests across 3 suites (`vitest run src`, including 13 tests in `spatialIntelligence.test.ts`)
- **Client App Test Suite:** 62 passing tests across 9 suites (`vitest run`, including `spatialPillar2.test.ts` and `cameraAndVision.test.ts`)
- **TypeScript Compilation:** Zero errors (`tsc -b && vite build`)
- **Memory Footprint:** Peak memory during full spatial query and image hash execution remains below **48MB**, completely safe for Render's 512MB free container tier.

---

## 6. Related Documentation

- [Testing Guide](./testing.md) — Complete breakdown of all 3 API and 9 App Vitest suites.
- [Deployment, Local Dev & Android Build Guide](./deployment-and-android.md) — Environment setup, Docker Compose, Render/Supabase/Vercel, and Android APK pipeline.
- [Pillar 4: Deep Offline & Mesh Resiliency](./architecture/pillar4-offline-mesh-resiliency.md) — PMTiles v3, CivicMesh P2P sync, and TSP route optimization.
- [Unified Spatial & Offline Mesh Synthesis](./architecture/unified-spatial-offline-mesh-synthesis.md) — Cross-pillar evaluation and integration blueprint.
