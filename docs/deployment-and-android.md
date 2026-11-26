# CivicLens — Deployment, Local Development & Android Build Guide

This guide covers environment configuration, Docker Compose local orchestration, manual local development, zero-cost cloud deployment (Render, Supabase, Vercel), GitHub Actions automation, and the Capacitor 8 Android APK build pipeline.

---

## 1. Environment Variables (`.env`)

Copy [`.env.example`](../.env.example) to `.env` at the repository root before running the API or frontend locally:

```bash
cp .env.example .env
```

The API loads `.env` from the repository root automatically via `process.loadEnvFile` in [`api/src/config/db.ts`](../api/src/config/db.ts) and [`api/src/config/secrets.ts`](../api/src/config/secrets.ts) when variables are not already present in `process.env`.

| Variable | Scope | Default / Example | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | API | `postgresql://postgres:postgres@localhost:5432/civiclens` | PostgreSQL / PostGIS connection string. SSL is automatically disabled for `localhost`/`127.0.0.1` and enabled for remote hosts. |
| `JWT_SECRET` | API | `civiclens-dev-secret-key-local-only-2026` (dev only) | Signing key for JWT session tokens. **Required** when `NODE_ENV=production` (startup throws if missing). |
| `PORT` | API | `4000` | HTTP port for the Express server ([`api/src/server.ts`](../api/src/server.ts)). |
| `NODE_ENV` | API | `development` | Controls Morgan log format (`dev` vs `combined`), strict CORS enforcement, `JWT_SECRET` requirement, and error message redaction. |
| `ALLOWED_ORIGINS` | API | `http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,https://civiclens.vercel.app,https://civiclens-api.onrender.com` | Optional comma-separated list of allowed CORS origins in production. Requests without an `Origin` header (e.g., Capacitor Android, `curl`) are permitted. |
| `DB_SSL_REJECT_UNAUTHORIZED` | API | `false` | Set to `true` on remote PostgreSQL connections to enforce strict TLS certificate verification. |
| `VITE_API_BASE_URL` | Frontend | `http://localhost:4000/api` | Base URL used by [`app/src/services/apiService.ts`](../app/src/services/apiService.ts) at Vite build/dev time. |

---

## 2. Docker Compose Setup (Local PostGIS + API)

[`docker-compose.yml`](../docker-compose.yml) provisions a containerized PostgreSQL 16 + PostGIS 3.4 database alongside the compiled Express API:

```bash
docker compose up --build -d
```

### Services Defined

1. **`db` (`postgis/postgis:16-3.4`, container `civiclens-postgis`)**
   - Exposes port `5432:5432` with database `civiclens`, user `postgres`, password `postgrespassword`.
   - Persists data in the named volume `postgis_data`.
   - Automatically initializes schema and seed data on first boot by mounting:
     - [`api/src/db/schema.sql`](../api/src/db/schema.sql) -> `/docker-entrypoint-initdb.d/01-schema.sql`
     - [`api/src/db/seed.sql`](../api/src/db/seed.sql) -> `/docker-entrypoint-initdb.d/02-seed.sql`
   - Healthcheck: `pg_isready -U postgres -d civiclens` (every 10s, 5s timeout, 5 retries).

2. **`api` (built from [`api/Dockerfile`](../api/Dockerfile), container `civiclens-api`)**
   - Waits for `db` to pass its `service_healthy` check (`depends_on`).
   - Uses a two-stage `node:20-alpine` Docker build:
     - **Builder stage:** Runs `npm ci` and `npm run build` (`tsc`) to emit `dist/`.
     - **Runner stage:** Runs `npm ci --omit=dev`, copies `dist/`, exposes port `4000`, and executes `node dist/server.js`.

> **Note:** If you also need the Pillar 2 spatial tables (`issue_corroborations`, `drainage_lines`, `topographic_depressions`), apply [`api/src/db/spatial_schema.sql`](../api/src/db/spatial_schema.sql) and [`api/src/db/migration.sql`](../api/src/db/migration.sql) against the running PostGIS instance.

---

## 3. Manual Local Development

### Backend API (`api/`)

```bash
cd api
npm install
npm start        # Runs ts-node-dev src/server.ts on PORT (default 4000)
```

For a production TypeScript build:

```bash
cd api
npm run build    # Compiles TypeScript into api/dist/
```

### Frontend PWA (`app/`)

```bash
cd app
npm install
npm run dev      # Starts Vite dev server on http://localhost:5173
```

On Windows, you can launch the Vite dev server directly from the repository root using [`run-dev.bat`](../run-dev.bat), which changes into `app/` and executes `npm run dev`.

Other useful frontend commands in `app/`:

- `npm run build` — Runs `tsc -b && vite build` to output the production PWA bundle and service worker into `app/dist/`.
- `npm run preview` — Serves the built `app/dist/` bundle locally on port `4173`.
- `npm run lint` — Runs ESLint across `app/`.

---

## 4. Free-Tier Cloud Deployment ($0/Month Architecture)

CivicLens is configured for zero-cost cloud hosting across three free-tier services:

| Layer | Provider | Configuration Notes |
| :--- | :--- | :--- |
| **Database** | **Supabase** (PostgreSQL + PostGIS) | Enable the `postgis` extension, then run `schema.sql`, `spatial_schema.sql`, `migration.sql`, and `seed.sql`. Copy the Postgres connection string into `DATABASE_URL`. |
| **Backend API** | **Render** (Web Service, Node 20) | Root directory: `api`. Build command: `npm ci && npm run build`. Start command: `node dist/server.js`. Set `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, and `ALLOWED_ORIGINS`. Health check path: `/api/health`. |
| **Frontend PWA** | **Vercel** (Static / Vite) | Root directory: `app`. Build command: `npm run build`. Output directory: `dist`. Set `VITE_API_BASE_URL` to your Render API URL (e.g., `https://civiclens-api.onrender.com/api`). |

### Keep-Alive Automation

Free-tier Supabase projects pause after 7 days of inactivity, and Render free services spin down after idle periods. [`.github/workflows/keep-alive.yml`](../.github/workflows/keep-alive.yml) runs on a `0 6 */4 * *` cron schedule (every 4 days at 06:00 UTC) and supports manual `workflow_dispatch` triggers:

- Pings `${{ secrets.RENDER_API_URL }}/api/health` (defaults to `https://civiclens-api.onrender.com/api/health`).
- Pings `${{ secrets.SUPABASE_URL }}/rest/v1/` with `apikey` and `Authorization: Bearer` headers using `${{ secrets.SUPABASE_ANON_KEY }}`.

Configure `RENDER_API_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` in **GitHub Repository Settings → Secrets and variables → Actions**.

---

## 5. Capacitor 8 Android APK Build Pipeline

The mobile app wraps the React/Vite PWA in **Capacitor 8** (`@capacitor/core` / `@capacitor/android` `^8.5.0`) with the native project checked into `app/android/`.

### Capacitor & Android Configuration

- **Config ([`app/capacitor.config.ts`](../app/capacitor.config.ts)):**
  - `appId`: `org.civiclens.app`
  - `appName`: `CivicLens`
  - `webDir`: `dist`
  - `server.androidScheme`: `'https'`
  - `plugins.SplashScreen`: 2000ms launch duration, auto-hide enabled, `#0f172a` background, spinner disabled.
- **Permissions ([`app/android/app/src/main/AndroidManifest.xml`](../app/android/app/src/main/AndroidManifest.xml)):**
  - `android.permission.INTERNET`
  - `android.permission.ACCESS_COARSE_LOCATION` and `android.permission.ACCESS_FINE_LOCATION` (optional GPS hardware feature)
  - `android.permission.CAMERA` (optional camera and autofocus hardware features)

### Building the Debug APK

#### Automated Windows Script (`build-apk.bat`)

Run [`build-apk.bat`](../build-apk.bat) from the repository root. It executes four stages:

1. **Frontend Build:** `npm run build` inside `app/` (`tsc -b && vite build`).
2. **Capacitor Sync:** `npx cap sync android` to copy `app/dist/` and update native plugins.
3. **Android SDK Detection:** Checks `app/android/local.properties`; if missing, generates it from `ANDROID_HOME` or `%LOCALAPPDATA%\Android\Sdk`.
4. **Gradle Build:** Runs `gradlew.bat assembleDebug` inside `app/android/`.

The output APK is written to:

```text
app/android/app/build/outputs/apk/debug/app-debug.apk
```

#### Manual CLI Steps (macOS / Linux / Windows)

```bash
cd app
npm run build
npx cap sync android
cd android
./gradlew assembleDebug    # Use gradlew.bat on Windows
```

For release builds, configure signing in `app/android/app/build.gradle` and run `./gradlew assembleRelease` (or open `app/android` in Android Studio via `npx cap open android`).

---

## Related Documentation

- [Testing Guide](./testing.md) — Vitest suites, `happy-dom`/`supertest` setup, and GitHub Actions CI pipeline.
- [Pillar 2: Advanced GIS & Spatial Intelligence](./pillar2-advanced-gis-spatial-intelligence.md) — PostGIS schema, deduplication, edge CV, and monsoon VSI.
- [Pillar 4: Deep Offline & Mesh Resiliency](./architecture/pillar4-offline-mesh-resiliency.md) — PMTiles v3, CivicMesh P2P sync, and TSP routing.
- [Unified Spatial & Offline Mesh Synthesis](./architecture/unified-spatial-offline-mesh-synthesis.md) — Cross-pillar integration and $0 free-tier constraints.
