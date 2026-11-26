# CivicLens Documentation Hub

Welcome to the **CivicLens** technical documentation. This hub organizes all architecture specifications, API/database references, frontend guides, and operational runbooks by **reader persona** and **system layer**.

---

## By Reader Persona

| If you are a… | Start with… | Then read… |
|---|---|---|
| **New Contributor / Evaluator** | [Root README](../README.md) | [Motivation & Domain](motivation-and-domain.md), [System Overview](architecture/system-overview.md) |
| **Backend / GIS Engineer** | [System Overview](architecture/system-overview.md) | [Backend API Reference](api/backend-api-reference.md), [PostGIS Schema & Queries](database/postgis-schema-and-queries.md) |
| **Frontend / Mobile Engineer** | [PWA & UI Architecture](frontend/pwa-and-ui.md) | [Offline & Mesh Engines](offline-and-mesh.md), [Design System](../DESIGN.md) |
| **DevOps / Field Deployer** | [Deployment & Android](deployment-and-android.md) | [Testing Guide](testing.md), [Unified Synthesis](architecture/unified-spatial-offline-mesh-synthesis.md) |
| **Systems Architect** | [Unified Synthesis](architecture/unified-spatial-offline-mesh-synthesis.md) | [Pillar 2: Spatial Intelligence](pillar2-advanced-gis-spatial-intelligence.md), [Pillar 4: Offline & Mesh](architecture/pillar4-offline-mesh-resiliency.md) |

---

## By System Layer

### 1. Domain, Planning & Design
- **[Motivation & Domain](motivation-and-domain.md)** — Rural Gram Panchayat problem statement, field workflows, RBAC roles (`viewer`, `surveyor`, `panchayat_officer`, `admin`), hardware/network/budget constraints, and measurable goals.
- **[Project Plan](../CivicLens_Project_Plan.md)** — Comprehensive 14-week EPICS specification, scope boundaries, and pilot objectives.
- **[Design System](../DESIGN.md)** — "Survey Atlas & Civic Governance" design tokens, outdoor-glare-resistant palette, typography, and 44px+ touch ergonomics.

### 2. Architecture & Synthesis
- **[System Overview](architecture/system-overview.md)** — End-to-end Client–API–PostGIS architecture, offline outbox sync flow, and security/RBAC/PII encryption diagrams.
- **[Pillar 2: Advanced GIS & Spatial Intelligence](pillar2-advanced-gis-spatial-intelligence.md)** — 30m spatial deduplication, 1-tap corroboration, 64-bit dHash Edge CV pipeline, and Monsoon Vulnerability (VSI) analysis.
- **[Pillar 4: Deep Offline & Mesh Resiliency](architecture/pillar4-offline-mesh-resiliency.md)** — PMTiles v3 offline district vector maps, CivicMesh v1 P2P sync, and dual-mode TSP maintenance route dispatch.
- **[Unified Spatial & Offline-Mesh Synthesis](architecture/unified-spatial-offline-mesh-synthesis.md)** — Critical stress-testing scorecard across 2GB RAM Android Go devices, 0-connectivity dead zones, and $0/month free-tier cloud constraints.

### 3. Backend & Database
- **[Backend API Reference](api/backend-api-reference.md)** — Express 5 server setup, security/compression/rate-limit middleware, Zod validation, JWT RBAC, every REST endpoint, and the service layer (`spatialDedupService`, `visionService`, `waterloggingService`).
- **[PostGIS Schema & Queries](database/postgis-schema-and-queries.md)** — Entity-Relationship diagram, `schema.sql`, `spatial_schema.sql`, `migration.sql`, `seed.sql`, partial functional GiST indexes, triggers, and stored functions (`fn_find_duplicate_issues`).

### 4. Frontend, Offline & Mesh
- **[PWA & UI Architecture](frontend/pwa-and-ui.md)** — React 19 + Vite 8 PWA shell, Workbox caching, all 7 views (`MapView`, `ReportIssueForm`, `MyReportsView`, `VolunteerQuickAdd`, `AdminDashboard`, `ReportPrintView`, `AuthScreen`), all 8 components, hooks, English/Hindi/Marathi i18n, `seedLoader.ts`, and `photoWorker.ts`.
- **[Offline & Mesh Engines](offline-and-mesh.md)** — Deep dive into Dexie.js v1/v2, AES-GCM-256 PII encryption, `apiService.ts` & `useOfflineSync.ts`, `meshSyncService.ts`, `pmtilesService.ts`, `routeOptimizationService.ts`, `offlineDedup.ts`, `cameraService.ts`, and `edgeVision.ts`.

### 5. Operations, Build & Quality
- **[Deployment & Android](deployment-and-android.md)** — `.env` configuration, Docker Compose stack, manual local dev (`run-dev.bat`), $0/month free-tier cloud deployment (Render/Supabase/Vercel), and Capacitor 8 Android APK build pipeline (`build-apk.bat`).
- **[Testing Guide](testing.md)** — Vitest suites across `api/` (3 suites) and `app/` (9 suites), test environments (`supertest`, `happy-dom`), and execution commands.
