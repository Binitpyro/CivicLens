# Frontend PWA & UI Architecture

CivicLens's frontend (`app/`) is an offline-first Progressive Web App (PWA) built with **React 19**, **TypeScript**, and **Vite**, packaged for Android via **Capacitor 8**. It is engineered for low-end 2 GB RAM devices, outdoor sunlight legibility, and intermittent 2G/3G rural connectivity.

---

## 1. Tech Stack & Dependencies

Defined in [`app/package.json`](../../app/package.json):

| Package | Version | Role |
| :--- | :--- | :--- |
| `react` / `react-dom` | `^19.2.8` | UI runtime with `React.lazy` code-splitting |
| `vite` / `@vitejs/plugin-react` | `^8.2.0` / `^6.0.4` | Build tool & HMR |
| `vite-plugin-pwa` | `^1.3.0` | Workbox service worker & Web App Manifest |
| `typescript` | `~6.0.2` | Static type checking (`tsc -b`) |
| `leaflet` / `leaflet.markercluster` | `^1.9.4` / `^1.5.3` | Interactive GIS map & marker clustering |
| `dexie` | `^4.4.4` | IndexedDB ORM for offline-first persistence |
| `i18next` / `react-i18next` | `^26.3.6` / `^17.0.11` | Multilingual UI (English, Hindi, Marathi) |
| `@capacitor/core` / `@capacitor/android` | `^8.5.0` | Native Android WebView bridge |
| `@capacitor/camera` / `@capacitor/geolocation` | `^8.2.6` / `^8.2.5` | Native camera-only capture & high-accuracy GPS |
| `vitest` / `happy-dom` | `^5.1.1` / `^21.0.4` | Unit & component test runner |

---

## 2. PWA Shell, Workbox Caching & Bundle Chunking

### Entry & Application Shell

- **[`app/src/main.tsx`](../../app/src/main.tsx)**: Registers the Workbox service worker immediately on boot via `registerSW({ immediate: true })` from `virtual:pwa-register`, imports `index.css`, and mounts `<App />` inside `<StrictMode>`.
- **[`app/src/App.tsx`](../../app/src/App.tsx)**:
  - Wraps the tree in `<ErrorBoundary>` and `<GeolocationProvider>`.
  - Gates access behind `AuthScreen` when `civiclens_token` / `civiclens_user` are absent from `localStorage`.
  - Code-splits all 7 views via `React.lazy()` and `<Suspense fallback={<ViewLoadingFallback />}>`.
  - Supports a full-screen print mode (`isPrintView` → `ReportPrintView`).
  - Manages 5 primary tabs (`TabType`: `'map' | 'report' | 'myReports' | 'quickAdd' | 'admin'`), keeping `MapView` mounted inside `.map-tab-pane` (`is-active` / `is-hidden`) so Leaflet zoom, pan, and filter state persist across tab switches.
  - Coordinates cross-view location picking (`pinPickTarget`: `'report' | 'quickAdd' | null`, `selectedCoords`, `quickAddAssetType`).

### Workbox & Rollup Configuration ([`app/vite.config.ts`](../../app/vite.config.ts))

- **Base Path**: `base: './'` for relative asset resolution inside Capacitor's Android WebView.
- **PWA Manifest**:
  - `short_name`: `'CivicLens'`, `name`: `'CivicLens — Village GIS Monitoring'`
  - `display`: `'standalone'`, `orientation`: `'portrait-primary'`
  - `theme_color`: `'#166534'`, `background_color`: `'#0f172a'`
  - `registerType`: `'autoUpdate'`, `includeAssets`: `['favicon.svg', 'icons.svg']`
- **Precache**: `globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}']`.
- **Runtime Caching**: OpenStreetMap raster tiles (`^https:\/\/[a-c]\.tile\.openstreetmap\.org\/.*/i`) use a `CacheFirst` strategy (`cacheName: 'openstreetmap-tiles'`, `maxEntries: 500`, `maxAgeSeconds: 2592000` [30 days], `cacheableResponse.statuses: [0, 200]`).
- **Manual Vendor Chunking** (`chunkSizeWarningLimit: 600`):
  - `vendor-react`: `react`, `react-dom`
  - `vendor-leaflet`: `leaflet`, `leaflet.markercluster`
  - `vendor-storage`: `dexie`
  - `vendor-i18n`: `i18next`, `react-i18next`

---

## 3. Design System & Tokens

Guided by [`DESIGN.md`](../../DESIGN.md) ("Survey Atlas & Civic Governance" in **Operate** mode) and implemented in [`app/src/tokens.css`](../../app/src/tokens.css):

1. **Outdoor Glare Resistance**: Warm topographic stone-linen paper (`--color-paper: #F4F1EA`) paired with crisp card surfaces (`--color-surface: #FFFFFF`). Dark mode (`[data-theme="dark"]`) shifts to `#0C1218` paper and `#131B24` surfaces.
2. **Primary Accent**: Civic Forest Emerald (`--color-accent: #0F5C4D`, hover `#0B473B`, subtle `#E6F2EF`) in light mode; Survey Teal (`#2DD4BF`) in dark mode.
3. **Semantic Status & GIS Layer Tokens**:
   - Status: `--color-status-active` (`#15803D`), `--color-status-pending` (`#B45309`), `--color-status-high` (`#9A3412`), `--color-status-urgent` (`#B91C1C`), `--color-status-info` (`#0369A1`), each with `-bg` and `-rule` pairs.
   - GIS Layers: `--color-layer-water` (`#0284C7`), `--color-layer-lighting` (`#D97706`), `--color-layer-sanitation` (`#0F5C4D`), `--color-layer-education` (`#6D28D9`), `--color-layer-health` (`#B91C1C`).
4. **Typography & Tabular Figures**: `Public Sans` (`--font-display`, `--font-body`) and `JetBrains Mono` (`--font-mono`). All coordinates, KPI counters, and timestamps enforce `font-variant-numeric: tabular-nums` via `.tabular-nums`.
5. **Scale & Layout**: 4 pt spacing scale (`--space-3xs` 2 px to `--space-3xl` 64 px), radii (`--radius-xs` 4 px to `--radius-pill` 9999 px), 4 elevation shadows (`--shadow-subtle` to `--shadow-modal`), ≥ 44 px touch targets, and a centered desktop console frame (`max-width: 540px; height: 94vh`) on viewports ≥ 768 px.

---

## 4. Views (`app/src/views/`)

| View | File | Purpose & Key Mechanics |
| :--- | :--- | :--- |
| **MapView** | [`MapView.tsx`](../../app/src/views/MapView.tsx) | Interactive Leaflet + `markerClusterGroup` map (`maxClusterRadius: 36`, `disableClusteringAtZoom: 17`) with singleton `iconCache` (`getCachedIcon`). Renders live GPS blue dot, color-coded accuracy circle, and rotating compass heading cone. Supports hold-tap (`480ms`, ≤ 10 px drift) / right-click `Quick Add at Pin`, `pinPickTarget` click-to-pick, filter chips (`all`, `issues`, `assets`), TSP `Repair Route` (`optimizeMaintenanceRoute` + `L.polyline` + `route-summary-card`), and `BottomSheet` detail inspection with live-photo issue resolution (`canResolveIssues` for `admin`, `panchayat_officer`, or `offline-demo-token`). |
| **ReportIssueForm** | [`ReportIssueForm.tsx`](../../app/src/views/ReportIssueForm.tsx) | 4-step citizen/volunteer grievance form: (1) 6-category grid, (2) 4-tier urgency bar (`low`, `medium`, `high`, `critical`), (3) live GPS or manual map pin with automatic 30 m `checkOfflineDuplicates` scan and 1-tap `queueOfflineCorroboration`, (4) up to `MAX_PHOTOS = 3` camera-only photos via `CameraReviewModal`. Encrypts optional phone number with `encryptPII()` and writes atomically to `db.issues` + `db.outbox` before calling `triggerSync()`. |
| **MyReportsView** | [`MyReportsView.tsx`](../../app/src/views/MyReportsView.tsx) | Polls `db.issues.reverse().toArray()` every 3 s with fingerprint diffing. Decrypts `encrypted_phone` on demand via `decryptPII()` (cached in `decryptedPhoneCache`). Provides `all`, `open`, `resolved`, and `pending` filter tabs, GPS tier pills, photo evidence strips, and `resolution_photo_url` proof cards. |
| **VolunteerQuickAdd** | [`VolunteerQuickAdd.tsx`](../../app/src/views/VolunteerQuickAdd.tsx) | Rapid field survey form for 6 asset types (`handpump`, `streetlight`, `public_toilet`, `drainage`, `anganwadi`, `school`). Captures GPS/manual coordinates, operational status (`active` / `non_functional`), optional camera-only photo, asset name, and LBD Asset ID (`lbd_asset_id`). Writes atomically to `db.assets` + `db.outbox`, increments session counter, and refreshes GPS/sync. |
| **AdminDashboard** | [`AdminDashboard.tsx`](../../app/src/views/AdminDashboard.tsx) | Ward Overview KPI matrix (Geotagged Assets, Open Grievances, Resolved Issues, Resolution Rate), category distribution bars, and Service Coverage & Infrastructure Gaps. Renders local Dexie metrics immediately (`computeLocalCoverageGaps`: schools/anganwadis lacking active water within 500 m or sanitation within 300 m) and overlays `/api/analytics/summary` & `/api/analytics/coverage-gaps` when online (4 s timeout). Includes **Export Report** button opening `ReportPrintView`. |
| **ReportPrintView** | [`ReportPrintView.tsx`](../../app/src/views/ReportPrintView.tsx) | Print-formatted Gram Sabha report (`window.print()`) with Executive Infrastructure Inventory table, High-Priority Grievances table, Coverage Gap Analysis, and Gram Sachiv / Sarpanch sign-off block. |
| **AuthScreen** | [`AuthScreen.tsx`](../../app/src/views/AuthScreen.tsx) | Phone + password login and account registration (`loginUser`, `registerUser`), EN/HI/MR language bar, password visibility toggle, and automatic offline fallback (`handleOfflineLogin` issuing `offline-demo-token` with `volunteer` role for Ward 1) when the server is unreachable or for demo mode. |

---

## 5. Reusable Components (`app/src/components/`)

- **[`Header.tsx`](../../app/src/components/Header.tsx)**: Top console bar displaying the `CivicLens` emblem, Ward 3 subtitle, interactive sync status chip (`is-offline`, `is-syncing`, `has-pending`, `is-demo`, or `online`), light/dark theme toggle (`civiclens-theme` in `localStorage`, `data-theme` attribute), settings popover (signed-in profile, EN/HI/MR language grid, Daylight Paper / Night Field theme switch, 2-step logout confirmation with pending outbox warning), and `coldStartNotice` banner.
- **[`BottomNav.tsx`](../../app/src/components/BottomNav.tsx)**: Fixed 5-tab navigation dock (`map`, `report`, `myReports`, `quickAdd`, `admin`) with `aria-current="page"` and active pill indicator.
- **[`BottomSheet.tsx`](../../app/src/components/BottomSheet.tsx)**: Accessible modal drawer (`role="dialog"`, `aria-modal="true"`) with Escape-key dismissal, backdrop click-to-close, and automatic focus on the close button.
- **[`CameraReviewModal.tsx`](../../app/src/components/CameraReviewModal.tsx)**: Dual-mode camera evidence modal (`mode: 'native' | 'webrtc'`, keyed by `${mode}:${initialDataUrl ?? 'live'}`). In `webrtc` mode, streams live `<video>` with camera flip (`environment` / `user`) and shutter capture; in `native` mode, reviews the `@capacitor/camera` DataURL. Runs `analyzePhotoQuality()` and `computeCanvasDHash()`, warns on dark/blurry frames ("Retake Photo" vs "Use Anyway"), compresses and burns telemetry via `compressPhotoOffThread()`, and returns a `PhotoCaptureMeta` object.
- **[`CivicIcons.tsx`](../../app/src/components/CivicIcons.tsx)**: 29 authored inline SVG icon components (`IconProps`: `size`, `color`, `strokeWidth`) plus `getCategoryIcon(categoryId, size)` and `getAssetTypeIcon(assetType, size)` mappers.
- **[`ErrorBoundary.tsx`](../../app/src/components/ErrorBoundary.tsx)**: React class error boundary catching unhandled render errors with a custom `fallback` prop or default recovery UI ("Try Again").
- **[`PermissionPromptCard.tsx`](../../app/src/components/PermissionPromptCard.tsx)**: Inline recovery card for `location` (`denied`, `gps_disabled`, `unsupported`) and `camera` permissions, showing platform-specific instructions (`Capacitor.isNativePlatform()` Android steps vs browser site-settings steps) and a Retry button.
- **[`StoragePersistModal.tsx`](../../app/src/components/StoragePersistModal.tsx)**: Checks `navigator.storage.persisted()` on startup and prompts once (`civiclens_persist_prompted`) to request `navigator.storage.persist()` so IndexedDB tile/report data is not evicted by the OS.

---

## 6. Hooks, i18n, Seed Loader & Photo Worker

### Custom Hooks (`app/src/hooks/`)

- **[`useGeolocation.ts`](../../app/src/hooks/useGeolocation.ts)**: Exports `GeolocationProvider`, `useGeolocation()`, `getQualityTier()` (`<=15` m `excellent`, `<=50` m `fair`, `>50` m `poor`), and `getLastDetectedLocation()`. Uses `@capacitor/geolocation` on native and `navigator.geolocation` on web. Filters accuracy regressions (> 2.5× or > 80 m within 15 s), multipath teleport spikes (> 45 m/s), and stationary micro-jitter (< 2.5 m within 4 s). Recovers stale watches (> 20 s) on `visibilitychange` and supports manual pin overrides (`setManualLocation`, `clearManualLocation`, `refreshFix`).
- **[`useOfflineSync.ts`](../../app/src/hooks/useOfflineSync.ts)**: Monitors `online`/`offline` events, polls `db.outbox.count()` every 3 s, and batches pending items (`CHUNK_SIZE = 5`) to `POST /api/sync` with a 45 s `AbortController` timeout and a 3 s `coldStartNotice` timer. Clears `synced` and `conflict_logged` items atomically in Dexie and marks records `sync_state: 'submitted'`.
- **[`useCompassHeading.ts`](../../app/src/hooks/useCompassHeading.ts)**: Exports `useCompassHeading()`, `normalizeHeading()`, `degreesToCardinal()`, and `extractCompassHeading()`. Listens to `deviceorientationabsolute` and `deviceorientation` (supporting iOS `webkitCompassHeading` and screen orientation offset), applies a 2° jitter deadband, and blends with GPS heading when moving (`speed > 0.5` m/s).

### Internationalization ([`app/src/i18n/index.ts`](../../app/src/i18n/index.ts))

Supports **3 languages** — English (`en`), Hindi (`hi`), and Marathi (`mr`) — via `i18next` and `react-i18next`. Persists the active locale in `localStorage` under `civiclens_language` (`setAppLanguage(lng)`) with `fallbackLng: 'en'`.

### Seed Data Loader ([`app/src/utils/seedLoader.ts`](../../app/src/utils/seedLoader.ts))

`initializeLocalSeedData()` checks `await db.assets.count() === 0`; if empty, it dynamically imports [`app/src/data/seed_pilot_ward.json`](../../app/src/data/seed_pilot_ward.json) and bulk-inserts 20 geotagged assets and 6 issues for Ward 3 into Dexie.

### Photo Compression & Watermarking ([`app/src/services/photoWorker.ts`](../../app/src/services/photoWorker.ts))

`compressPhotoOffThread(fileOrDataUrl, telemetry?)` strips EXIF metadata by re-encoding onto an HTML5 Canvas, scales images to fit within `1024×768` (using `createImageBitmap` off-main-thread when available, falling back to `FileReader` + `Image`), optionally burns a 2-line monospace telemetry bar (`formatTelemetryStamp`: coordinates, `±Xm GPS` or `MANUAL PIN`, compass bearing, timestamp, and `CivicLens Verified`), and outputs JPEG at `0.60` quality.
