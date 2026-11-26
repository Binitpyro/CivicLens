# System Architecture Overview

CivicLens is a **local-first, thin-server GIS platform**. The user's smartphone (PWA or Capacitor 8 Android APK) is the primary execution environment for reading maps, capturing geotagged media, deduplicating nearby reports, and queueing mutations. The Node.js/Express 5 API and PostgreSQL/PostGIS database act as the spatial aggregation, analytics, and multi-device synchronization hub.

---

## 1. Client–API–PostGIS Architecture

```mermaid
flowchart TB
    subgraph Client["Client Layer (app/ - React 19 + Vite 8 PWA / Capacitor 8)"]
        Shell["App Shell (App.tsx, Header, BottomNav, i18n)"]
        Views["Views: MapView, ReportIssueForm, MyReportsView, VolunteerQuickAdd, AdminDashboard, ReportPrintView, AuthScreen"]
        LocalDB["Dexie.js v1/v2 (IndexedDB: assets, issues, outbox)"]
        Crypto["Web Crypto AES-GCM-256 PII Encryption (db/index.ts)"]
        OfflineServices["Offline Services: pmtilesService, offlineDedup, edgeVision, photoWorker, routeOptimizationService, meshSyncService"]
        Shell --> Views
        Views <--> LocalDB
        LocalDB <--> Crypto
        Views <--> OfflineServices
    end

    subgraph Network["Sync & Transport"]
        HTTP["HTTPS REST + Gzip (/api/*)"]
        P2P["CivicMesh P2P (QR-WebRTC / SoftAP / Data-Mule)"]
    end

    subgraph Server["API Layer (api/ - Node.js + Express 5 + TypeScript)"]
        SecMW["Middleware: Helmet, CORS, Compression, Morgan, RateLimit, Cache-Control"]
        AuthMW["Auth Middleware: authenticateToken, optionalAuthenticateToken, requireRole"]
        Controllers["Controllers: auth, asset, issue, spatial, analytics, sync"]
        Services["Services: spatialDedupService, visionService, waterloggingService"]
        SecMW --> AuthMW --> Controllers --> Services
    end

    subgraph DB["Data Layer (PostgreSQL 16 + PostGIS 3.4)"]
        CoreTables["Core Tables: users, villages, wards, assets, issues, reports"]
        SpatialTables["Pillar 2 Tables: issue_corroborations, topographic_depressions, drainage_lines"]
        Indexes["Partial Functional GiST Indexes & Stored Functions (fn_find_duplicate_issues)"]
        CoreTables --- SpatialTables --- Indexes
    end

    OfflineServices <--> P2P
    LocalDB <-->|"Batched Outbox & GeoJSON"| HTTP
    HTTP <--> SecMW
    Services <-->|"pg Pool Parameterized SQL"| CoreTables
```

### Layer Responsibilities

- **Client Layer (`app/`)**: Renders Leaflet maps (with PMTiles v3 offline vector tiles and MarkerCluster), captures GPS + compass heading + compressed WebP photos, runs 30m local deduplication and 2-Opt TSP routing, and persists all state in Dexie.js IndexedDB.
- **API Layer (`api/`)**: Stateless Express 5 server hardened with `helmet`, `cors`, `compression`, `morgan`, and `express-rate-limit`. Validates payloads with Zod, enforces JWT RBAC, and delegates spatial math to PostGIS.
- **Data Layer (`PostgreSQL + PostGIS`)**: Stores authoritative village/ward polygons, GeoJSON-ready infrastructure assets, issues, community corroborations, and monsoon vulnerability geometry indexed with GiST.

---

## 2. Offline Outbox & Sync Flow

CivicLens avoids per-tap network requests. Every creation or update is committed locally first with a client-generated UUID (`crypto.randomUUID()`) and a monotonic `client_seq_num`, then drained in batches when connectivity returns.

```mermaid
sequenceDiagram
    participant User as Field User
    participant UI as React View
    participant Dexie as Dexie.js (IndexedDB)
    participant SyncHook as useOfflineSync
    participant API as Express /api/sync
    participant PG as PostgreSQL + PostGIS

    User->>UI: Submit Issue / Asset (Offline or Online)
    UI->>Dexie: Encrypt phone (AES-GCM-256) & generate UUID + dHash
    UI->>Dexie: Write record (sync_state='saved') + enqueue OutboxItem
    UI-->>User: Immediate confirmation (0ms network wait)

    Note over SyncHook,API: Connectivity restored or manual sync triggered
    SyncHook->>Dexie: Read pending OutboxItem batch (ordered by client_seq_num)
    SyncHook->>Dexie: Mark sync_state='syncing'
    SyncHook->>API: POST /api/sync (JWT Bearer + batch mutations)
    API->>PG: Idempotent UPSERT on UUID + timestamp/version conflict check
    PG-->>API: Accepted IDs + any flagged conflicts
    API-->>SyncHook: 200 OK { synced, conflicts }
    SyncHook->>Dexie: Remove synced items from outbox, mark sync_state='submitted'
```

### Dead-Zone Relaying (CivicMesh)
When a surveyor is in a cellular dead zone for days, `meshSyncService.ts` allows two devices to exchange signed outbox payloads over QR-signaled WebRTC DataChannels or Local SoftAP. The receiving "data mule" device stores the relayed items and uploads them to `POST /api/sync` once it reaches network coverage. See [Offline & Mesh Engines](../offline-and-mesh.md) for protocol details.

---

## 3. Security, RBAC & PII Encryption

```mermaid
flowchart LR
    subgraph Device["On-Device Privacy (app/src/db/index.ts)"]
        Phone["Reporter Phone Number"] -->|"Web Crypto SHA-256(device_seed)"| AES["AES-GCM-256 Encrypted Blob"]
    end

    subgraph Transport["API Security (api/src/server.ts & middleware/auth.ts)"]
        Req["Incoming Request"] --> HelmetCors["Helmet + Restricted CORS + Rate Limiter"]
        HelmetCors -->|"Public Read (GET /api/issues)"| OptAuth["optionalAuthenticateToken"]
        HelmetCors -->|"Write / Sync (POST /api/issues, /api/sync)"| ReqAuth["authenticateToken (JWT)"]
        HelmetCors -->|"Status Change (PATCH /api/issues/:id/status)"| RoleGuard["requireRole('admin', 'panchayat_officer')"]
    end

    OptAuth -->|"Unauthenticated"| StripPII["Strip Reporter PII Fields"]
    OptAuth -->|"Authenticated"| FullData["Return Authorized Payload"]
```

- **Device-Side PII Protection**: Phone numbers entered in `ReportIssueForm` are encrypted with AES-GCM-256 using a per-device 32-byte random seed (`civiclens_device_key_seed` in `localStorage`), ensuring raw PII is not exposed in plaintext IndexedDB dumps.
- **Server-Side PII Stripping**: `GET /api/issues` uses `optionalAuthenticateToken` so public map viewers see issue locations, categories, and severities without exposing reporter personal identifiers.
- **Role-Based Access Control**: `authenticateToken` verifies the JWT signature against `JWT_SECRET`, and `requireRole('admin', 'panchayat_officer')` guards privileged state transitions (`PATCH /api/issues/:id/status`).
- **Transport & Abuse Controls**: `authLimiter` caps `/api/auth/login` and `/api/auth/register` at 30 requests per 15 minutes; `generalApiLimiter` caps `/api/` at 300 requests per 15 minutes; JSON payloads are capped at `10mb`.

---

## Related Documentation

- [Backend API Reference](../api/backend-api-reference.md) — Detailed endpoint contracts and middleware configuration
- [PostGIS Schema & Queries](../database/postgis-schema-and-queries.md) — Full DDL, spatial indexes, and stored functions
- [PWA & UI Architecture](../frontend/pwa-and-ui.md) — Views, components, hooks, and Workbox caching
- [Offline & Mesh Engines](../offline-and-mesh.md) — Dexie, PMTiles v3, CivicMesh, TSP, and Edge CV
