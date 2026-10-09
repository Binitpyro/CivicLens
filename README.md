# CivicLens 🗺️🏛️

**GIS-Based Village Resource & Infrastructure Monitoring System**

CivicLens is a full-stack, mobile-first, and local-first GIS (Geographic Information System) platform built to transform scattered rural infrastructure data and resident grievances into an interactive, spatial map-based system. 

In rural governance (such as Gram Panchayats in India), infrastructure logs typically live in paper registers and complaints are communicated by word of mouth. CivicLens bridges the gap between residents, field volunteers (ASHA/Anganwadi workers, survey teams), and local administration by turning handpumps, streetlights, roads, public toilets, and sanitation issues into geotagged, spatial records that can be audited, prioritized, and analyzed on a map.

---

## 🌟 Key Features

- **📱 Mobile-First & Local-First (Offline by Default)**: Designed for rural environments with patchy 2G/3G or zero connectivity. Built with [Dexie.js](https://dexie.com/) (IndexedDB) and Workbox Service Worker — all data can be read, created, and reviewed offline.
- **🔄 Outbox Background Synchronization**: Edits and submissions are saved on-device with client-generated UUIDs and queued in an offline outbox. When connectivity is restored, records batch-sync idempotently with conflict-flagging and last-write-wins resolution.
- **🗺️ Interactive Spatial Map & Layer Controls**: Built on [Leaflet.js](https://leafletjs.com/) with marker clustering and offline tile caching. Toggle distinct infrastructure layers: handpumps, overhead water tanks, schools, Anganwadis, primary health centres (PHCs), public toilets, streetlights, roads, and drainage.
- **🚨 Citizen Grievance Reporting**: Residents can submit issues with single-tap GPS geotagging, category classification (Water, Sanitation, Lighting, Roads, Health, Education), severity ranking (Low, Medium, High, Critical), and photo attachments.
- **⚡ Client-Side Photo Optimization**: A dedicated Web Worker (`photoWorker.ts`) compresses photos on the client device before queueing, conserving mobile bandwidth and free-tier cloud storage.
- **📊 PostGIS Spatial Analytics Engine**:
  - **Buffer Analysis / Coverage Gaps**: Automatically detect underserved areas, such as schools without a functioning drinking water source within 500 meters (`ST_DWithin`).
  - **Spatial Hotspot Clustering**: Grid-based aggregation and K-means spatial clustering (`ST_ClusterKMeans`) to highlight grievance density hotspots for Gram Sabha budget planning.
  - **Spatial Joins**: Automatically assign assets and issues to official Panchayat ward boundaries (`ST_Within`).
- **🖨️ Gram Sabha Ward Report Generator**: Generate clean, printable ward-level summary reports featuring GIS snapshot layouts, asset health counts, and high-priority issue checklists for Gram Sabha meetings.
- **🌐 Multilingual UI (i18n)**: Out-of-the-box support for **English** and **Hindi (हिंदी)** via `i18next`, complemented by intuitive civic iconography for low-literacy usability.
- **📲 Progressive Web App (PWA) & Android APK**: Shareable via QR code / WhatsApp link as an installable PWA with zero installation friction, or compiled to a native Android APK using [Capacitor](https://capacitorjs.com/).

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              CLIENT LAYER (React 19 + Vite PWA)              │
│                                                             │
│  - One responsive UI: Resident, Volunteer, Admin Dashboard │
│  - Dexie.js (IndexedDB): Local storage of assets & outbox   │
│  - Workbox Service Worker: Offline app shell & tile caching │
│  - Leaflet + MarkerCluster: Spatial rendering & GPS mapping │
│  - Web Worker: In-browser image compression                 │
└──────────────────────────────┬──────────────────────────────┘
                               │ Background Batched Sync (/api/sync)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 API LAYER (Node.js + Express 5)              │
│                                                             │
│  - Stateless REST endpoints: /api/assets, /api/issues       │
│  - Spatial Analytics Engine: /api/analytics                 │
│  - JWT & bcrypt authentication with role-based access       │
│  - Compression & cache-control optimization                 │
└──────────────────────────────┬──────────────────────────────┘
                               │ Spatial SQL Queries
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 DATA LAYER (PostgreSQL + PostGIS)            │
│                                                             │
│  - PostGIS Spatial Extension (geometry & geography types)   │
│  - GiST spatial indexing for high-speed radius & KNN queries│
│  - Tables: users, villages, wards, assets, issues, reports   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Repository Structure

```
CivicLens/
├── api/                             # Node.js + Express + TypeScript Backend
│   ├── src/
│   │   ├── config/
│   │   │   └── db.ts                # PostgreSQL / PostGIS connection pool
│   │   ├── controllers/
│   │   │   ├── analyticsController.ts # PostGIS coverage gaps & grid hotspots
│   │   │   ├── assetController.ts     # GeoJSON asset CRUD
│   │   │   ├── authController.ts      # Authentication (JWT + bcrypt)
│   │   │   ├── issueController.ts     # Grievance ingestion & status updates
│   │   │   └── syncController.ts      # Offline outbox batch synchronization
│   │   ├── db/
│   │   │   ├── schema.sql           # PostGIS DDL schema and GiST indexes
│   │   │   ├── seed.sql             # Pilot ward mock spatial data
│   │   │   └── migration.sql        # Database migration scripts
│   │   ├── middleware/
│   │   │   └── auth.ts              # JWT verification and RBAC guards
│   │   └── server.ts                # Express server entry point & routing
│   ├── package.json
│   └── tsconfig.json
│
├── app/                             # React 19 + TypeScript + Vite PWA & Android
│   ├── android/                     # Capacitor Native Android Studio project
│   ├── src/
│   │   ├── assets/                  # Icons and graphics
│   │   ├── components/              # UI components (Header, BottomNav, BottomSheet, Modal, Icons)
│   │   ├── data/
│   │   │   └── seed_pilot_ward.json # Embedded pilot ward offline seed records
│   │   ├── db/
│   │   │   └── index.ts             # Dexie.js IndexedDB schema & encryption
│   │   ├── hooks/
│   │   │   ├── useGeolocation.ts    # GPS fix capture with error handling
│   │   │   └── useOfflineSync.ts    # Outbox polling and sync orchestrator
│   │   ├── i18n/
│   │   │   └── index.ts             # English & Hindi translations
│   │   ├── services/
│   │   │   ├── apiService.ts        # API client with JWT handling
│   │   │   └── photoWorker.ts       # Off-thread image compression
│   │   ├── utils/
│   │   │   └── seedLoader.ts        # Offline DB seeder
│   │   ├── views/
│   │   │   ├── AdminDashboard.tsx   # Ward KPIs, resolution rates, charts
│   │   │   ├── AuthScreen.tsx       # Login & Registration screen
│   │   │   ├── MapView.tsx          # Interactive Leaflet map with filters
│   │   │   ├── MyReportsView.tsx    # Resident issue status tracking
│   │   │   ├── ReportIssueForm.tsx  # Citizen grievance submission form
│   │   │   ├── ReportPrintView.tsx  # Printable Gram Sabha ward report
│   │   │   └── VolunteerQuickAdd.tsx# Fast field-survey asset addition
│   │   ├── App.tsx                  # Tab navigation and routing shell
│   │   └── main.tsx                 # React DOM mount point
│   ├── capacitor.config.ts          # Capacitor Android configuration
│   ├── vite.config.ts               # Vite configuration with vite-plugin-pwa
│   └── package.json
│
├── .github/workflows/
│   └── keep-alive.yml               # Automated cron pinger for free-tier hosting
├── build-apk.bat                    # One-click Windows batch script to build Android APK
├── run-dev.bat                      # One-click script to launch Vite dev server
├── CivicLens_Project_Plan.md        # Comprehensive 14-week specification & EPICS plan
└── README.md
```

---

## 🛠️ Tech Stack

| Domain | Technology | Purpose |
|---|---|---|
| **Frontend Framework** | [React 19](https://react.dev/) + [Vite](https://vitejs.dev/) | High-performance, reactive mobile-first PWA |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | End-to-end type safety |
| **Offline Storage** | [Dexie.js](https://dexie.com/) (IndexedDB) | On-device persistent database for offline resilience |
| **Map Engine** | [Leaflet](https://leafletjs.com/) + [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) | Lightweight spatial map visualization and clustering |
| **PWA Engine** | [Vite Plugin PWA](https://vite-pwa-org.netlify.app/) (Workbox) | Offline app shell caching & service worker routing |
| **Localization** | [i18next](https://www.i18next.com/) & `react-i18next` | English and Hindi bilingual UI support |
| **Mobile Runtime** | [Capacitor 8](https://capacitorjs.com/) | Android APK generation from the same web codebase |
| **Backend API** | [Node.js](https://nodejs.org/) & [Express 5](https://expressjs.com/) | Thin REST API with gzip compression |
| **Database** | [PostgreSQL](https://www.postgresql.org/) + [PostGIS](https://postgis.net/) | Spatial indexing (GiST), buffer analysis, clustering |
| **Authentication** | [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) + [bcryptjs](https://github.com/dcodeIO/bcrypt.js) | JWT-based auth with offline fallback demo profile |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18.x or higher) & **npm**
- **PostgreSQL** (v14+) with **PostGIS** extension installed (or a hosted instance such as [Supabase](https://supabase.com/) or [Neon](https://neon.tech/))
- *(Optional for Android builds)* **Android Studio** & **Android SDK** with `ANDROID_HOME` configured

---

### 1. Database Setup

Create a PostgreSQL database and initialize the PostGIS schema and seed data:

```bash
# Connect to your PostgreSQL instance
psql -U postgres -d postgres

# Create database
CREATE DATABASE civiclens;
\c civiclens

# Execute schema and initial seeds
\i api/src/db/schema.sql
\i api/src/db/seed.sql
```

---

### 2. Backend API Setup

1. Navigate to the `api` directory:
   ```bash
   cd api
   npm install
   ```

2. Create a `.env` file in the project root or configure your connection string:
   ```env
   PORT=4000
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/civiclens
   JWT_SECRET=your_jwt_secret_key_here
   ```

3. Start the API server:
   ```bash
   # Development mode with hot reload
   npm start

   # Production build
   npm run build
   node dist/server.js
   ```

The API will listen at `http://localhost:4000`. Health check is available at `GET /api/health`.

---

### 3. Frontend App Setup

1. In a new terminal, navigate to the `app` directory:
   ```bash
   cd app
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```
   *(On Windows, you can also double-click [run-dev.bat](file:///d:/projects/CivicLens/run-dev.bat))*

3. Open `http://localhost:5173` in your browser.
   - For mobile testing, open Chrome DevTools and switch to Mobile Device Emulation.
   - Test offline mode by going to Network tab and selecting **Offline**.

---

### 4. Building the Android APK

If you have Android Studio and the Android SDK installed:

```bash
# Option A: Run the one-click build script (Windows)
build-apk.bat

# Option B: Manual build steps
cd app
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

The compiled APK will be located at:
`app/android/app/build/outputs/apk/debug/app-debug.apk`

---

## 🔌 API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | None | Service heartbeat and uptime check |
| `POST` | `/api/auth/register` | None | Register a resident or volunteer surveyor |
| `POST` | `/api/auth/login` | None | Authenticate user and receive JWT token |
| `GET` | `/api/assets` | None | Retrieve infrastructure assets as a GeoJSON FeatureCollection |
| `POST` | `/api/assets` | JWT | Create a new geotagged asset |
| `GET` | `/api/issues` | None | Retrieve reported issues as a GeoJSON FeatureCollection |
| `POST` | `/api/issues` | JWT | Submit a new grievance with photo and location |
| `PATCH`| `/api/issues/:id/status`| Admin/Officer | Update issue lifecycle status (`open` → `in_progress` → `resolved`) |
| `GET` | `/api/analytics/summary` | None | Overall asset/issue counts, resolution status breakdown |
| `GET` | `/api/analytics/coverage-gaps` | None | PostGIS buffer analysis (e.g., schools without handpumps in 500m) |
| `GET` | `/api/analytics/hotspots` | None | Spatial grid aggregation of issue density |
| `POST` | `/api/sync` | JWT | Batch sync client outbox mutations with conflict resolution |

---

## 🔒 Security & Privacy

- **Citizen Privacy**: Resident personal identifiers (phone numbers, full names) can be locally encrypted or anonymized on-device; PII is strictly restricted to administrative roles.
- **Role-Based Access Control (RBAC)**: Users are categorized as `viewer`, `surveyor`, `panchayat_officer`, or `admin`. Issue status modifications and administrative exports require authorized tokens.
- **Offline Integrity**: On-device mutations use cryptographically strong UUIDs (`crypto.randomUUID()`) to prevent ID collisions when multiple surveyors collect data concurrently without connectivity.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](file:///d:/projects/CivicLens/LICENSE) file for details.
