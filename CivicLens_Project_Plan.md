# CivicLens — GIS-Based Village Resource & Infrastructure Monitoring System

**Comprehensive Project Plan & Technical Specification** for an all-CS EPICS team

*Assumes an 8-member team working one semester (~14 weeks) on a single pilot village/ward. Adjust the timeline and role count if your team differs.*

---

## 1. Project Overview

CivicLens is a full-stack GIS platform that turns scattered village infrastructure data and resident complaints into a single, map-based system. Instead of notebooks and verbal reports, every asset (a tap, a streetlight, a school) and every issue (a broken drain, an unsafe water point) becomes a geotagged record that can be visualized, queried, and analyzed spatially — turning the project from "an app" into an actual planning tool.

---

## 2. Problem Statement

Villages and semi-urban communities face recurring infrastructure and service issues — poor drainage, waste accumulation, broken streetlights, unsafe water points, and inadequate public amenities — but these problems are rarely documented in a structured, location-aware way. Without spatial context, local bodies can't easily see where problems cluster, which areas lack services entirely, or what to prioritize with limited budgets. CivicLens addresses this by giving village-level data a map, not just a list.

---

## 3. Goals & Measurable Objectives

**Primary Goal:** Design and deploy a GIS-based village mapping and issue-monitoring platform that identifies, visualizes, and prioritizes local infrastructure and public-service problems.

**Objectives (semester-scoped, measurable):**

1. Geotag ≥90% of visible public infrastructure in the pilot ward (roads, water points, toilets, streetlights, schools, health centers) by Week 9.
2. Ship an interactive dashboard where any team member or stakeholder can filter assets/issues by type, ward, and status in under 3 clicks.
3. Implement a severity/priority scoring rule (not just a manual tag) so issues are ranked, not just listed.
4. Produce at least one exportable ward-level PDF report usable by a panchayat or NGO for planning.
5. Run two field-validation rounds with real residents/stakeholders and document their feedback.

---

## 4. Scope

**In scope (v1 / MVP)**
- One village or ward
- Geotagged infrastructure inventory (points + attributes)
- Resident/survey-team issue reporting with photo + severity
- Admin dashboard with counts, ward breakdown, and a hotspot view
- PDF report export

**Out of scope (v1)**
- Statewide or multi-village rollout
- Live integration with government systems
- Satellite/raster imagery analysis
- Predictive AI forecasting (a rule-based priority score is enough for v1)

Keeping scope to one ward is deliberate — it's the difference between a system that's fully working versus one that's half-built across ten places.

---

## 5. System Architecture

Given the target users, this has to be **mobile-first and local-first**: rural residents and field volunteers are far more likely to own an Android phone than a laptop, and connectivity in the pilot ward may be patchy or absent entirely. The architecture reflects that — the phone is where the work happens, and the server exists to aggregate and analyze, not to gatekeep every action.

**Design principles:**
- **Mobile-first, not "mobile too"** — the primary surface is a phone-sized responsive app. The "admin dashboard" is the same app at a wider viewport, not a separate product.
- **Local-first** — every screen reads from and writes to on-device storage first, so the app is instant and fully usable offline. Sync to the server happens in the background whenever a connection exists.
- **Low server footprint** — the server does the one thing a phone genuinely can't do well: spatial analysis across the whole ward's dataset. Everything else stays on-device.

```
┌───────────────────────────────────────────────┐
│    CLIENT — one responsive PWA, mobile-first     │
│                                                    │
│  One React app for residents, volunteers, admins   │
│  IndexedDB: local cache of assets/issues + outbox    │
│  Service Worker: offline app shell + visited tiles     │
│  Leaflet renders from local store first, network 2nd    │
└──────────────────────┬──────────────────────────────────┘
                        │ background, batched sync (not per-tap)
┌──────────────────────▼──────────────────────────────────┐
│           API LAYER — thin & stateless                     │
│   Node.js + Express: /sync  /auth  /analytics — that's it    │
└──────────────────────┬──────────────────────────────────┘
                        │ spatial queries only where a phone
                        │ genuinely can't do the work
┌──────────────────────▼──────────────────────────────────┐
│                    DATA LAYER                                │
│  PostgreSQL + PostGIS (source of truth) · compressed photos  │
└────────────────────────────────────────────────────────────┘
```

A phone can filter, sort, and do simple distance checks against its own cached data — that's local compute, and it's what keeps the app fast and usable at zero bars of signal. What a phone can't efficiently do is a spatial join across the whole ward's dataset or k-means clustering for hotspots — that stays server-side, but runs on a schedule (nightly, or on-demand from the admin view) instead of on every dashboard load. That scheduling, more than anything else, is what keeps server usage low.

---

## 6. Technical Stack

| Layer | Technology | Why |
|---|---|---|
| App (single codebase) | React + Vite, built as a **PWA** (Workbox service worker) | One responsive codebase for residents, volunteers, and admins — no app store, no separate native build to maintain |
| Local storage | IndexedDB via Dexie.js | The on-device source of truth — the app works fully offline and syncs when a connection shows up |
| Map rendering | Leaflet.js + `leaflet.offline` | Tiles cache to IndexedDB as they're viewed, so a previously-loaded area of the map works at zero signal |
| Client-side spatial ops | Turf.js | Distance checks/filtering on cached data run on-device — no server round-trip for the simple stuff |
| Backend API | Node.js + Express (or Django + GeoDjango if the team prefers Python) | Kept deliberately thin: sync, auth, and the handful of queries a phone can't do |
| Database | PostgreSQL + PostGIS | Still the right call for the heavier spatial work (clustering, coverage gaps) that needs the full dataset |
| Auth | JWT + bcrypt | Lightweight; works offline once a token is cached locally |
| Photo handling | Client-side resize/compress (`browser-image-compression`) before upload | Cuts upload size sharply — matters a lot on 2G/3G rural data |
| Charts | Recharts | Dashboard stats — lightweight, renders fine on a mid-range phone |
| PDF export | Puppeteer or `react-pdf` (server-side) | Runs on the server on demand — not something to push onto a low-end phone |
| Deployment | Static PWA on Netlify/Vercel (free CDN) + API on a small free-tier instance (Render/Railway) or serverless functions | Serving the app itself costs close to nothing; only the thin API layer needs a server running at all |

**Why a PWA instead of a native app:** a native Android app means an install step — Play Store or a sideloaded APK — which is real friction for a resident who just wants to report one pothole. A PWA is just a link, shareable over WhatsApp or printed as a QR code on a village noticeboard; it adds itself to the home screen after the first visit and behaves like an app from then on, offline included. The one place native still has a real edge is rock-solid background GPS — if the survey team specifically needs that, React Native for just the volunteer-survey flow (distributed as a direct APK to the trained survey team, not to residents) is a reasonable swap.

**Fast-start tip:** for the database, skip DB ops entirely with **Supabase** — hosted PostgreSQL with PostGIS installable as an extension, plus built-in auth and file storage. For a semester project this alone can save a team a couple of weeks of infrastructure setup. Be cautious of the "SQLite for simplicity" route sometimes suggested for MVPs — plain SQLite has no native spatial type or spatial index, so you'd lose most of what makes PostGIS worth using in the first place.

---

## 7. Data Model

Core tables: `users`, `villages`, `wards`, `assets`, `issues`, plus `reports` for exports.

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin','surveyor','viewer','officer')) DEFAULT 'viewer',
  ward_id INTEGER,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE villages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  boundary GEOMETRY(POLYGON, 4326)
);

CREATE TABLE wards (
  id SERIAL PRIMARY KEY,
  village_id INTEGER REFERENCES villages(id),
  name TEXT NOT NULL,
  boundary GEOMETRY(POLYGON, 4326)
);

CREATE TABLE assets (
  id SERIAL PRIMARY KEY,
  ward_id INTEGER REFERENCES wards(id),
  asset_type TEXT NOT NULL CHECK (asset_type IN (
    'road','water_point','toilet','school','health_center',
    'streetlight','waste_point','drainage','anganwadi','bus_stop'
  )),
  name TEXT,
  status TEXT DEFAULT 'active',
  location GEOMETRY(POINT, 4326) NOT NULL,
  attributes JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX idx_assets_location ON assets USING GIST (location);

CREATE TABLE issues (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER REFERENCES assets(id),
  ward_id INTEGER REFERENCES wards(id),
  category TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low','medium','high','critical')) DEFAULT 'medium',
  description TEXT,
  photo_url TEXT,
  location GEOMETRY(POINT, 4326) NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  reported_by INTEGER REFERENCES users(id),
  assigned_officer TEXT,
  date_reported TIMESTAMP DEFAULT now(),
  date_resolved TIMESTAMP
);
CREATE INDEX idx_issues_location ON issues USING GIST (location);

CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  ward_id INTEGER REFERENCES wards(id),
  generated_by INTEGER REFERENCES users(id),
  report_type TEXT,
  file_url TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

The `GIST` indexes on `location` are what make spatial queries (nearest-neighbor, buffer, containment) fast instead of scanning every row.

---

## 8. Module Specifications

**A. Map Layer Module** — Base map with toggleable layers (roads, water points, toilets, schools, etc.), popups on click, search-by-ward. Tiles and data cache locally as the ward is explored, so a volunteer's already-viewed area stays usable with no signal.
`GET /api/assets?type=toilet&ward_id=3` → GeoJSON FeatureCollection, cached to IndexedDB on fetch.

**B. Issue Reporting Module** — Tap-to-pin location, category dropdown, severity selector, photo upload.
`POST /api/issues` with `{category, severity, location, photo}`.

**C. Admin Dashboard** — Total/ward-wise/category-wise counts, resolved vs. open, monthly trend chart.
`GET /api/analytics/summary` — powered by a spatial join between `issues` and `wards`.

**D. Survey Data Collection Module** — GPS auto-capture, local queue, batch sync when back online. This isn't a special offline mode bolted onto one screen — it's the same local-first pattern from Section 5, applied to data entry.
`POST /api/assets/bulk` for syncing a batch after a survey trip.

**E. Analytics / Hotspot Module** — Heatmap of complaint density, clustering, coverage-gap detection (e.g., schools with no nearby toilet).
`GET /api/analytics/hotspots`, `GET /api/analytics/coverage-gaps`.

**F. Report Generation Module** — Ward-level PDF with a map snapshot, top-priority issue list, and asset summary table.
`GET /api/reports/ward/:id`.

---

## 9. GIS Operations → Feature Mapping

This is where the conceptual GIS toolkit becomes actual features:

| GIS Operation | How it's used | Example |
|---|---|---|
| **Buffer analysis** | Coverage-gap detection — "schools with no toilet within 500m" | `ST_DWithin(school.location::geography, toilet.location::geography, 500)` |
| **Spatial join** | Attaching each issue to its ward for dashboard counts | `ST_Within(issue.location, ward.boundary)` |
| **Clustering/hotspot** | Complaint density heatmap | `ST_ClusterKMeans(location, 5) OVER ()` or grid-count aggregation |
| **Proximity/nearest-neighbor** | "Nearest health center" lookup | `ORDER BY location <-> ST_MakePoint(:lon,:lat)` (KNN operator) |
| **Overlay analysis** | Combining two asset layers to find under-served zones | `ST_Intersects` / `ST_Contains` between layers |
| **Geocoding** | Address fallback when GPS is unavailable during survey | External call to Nominatim/OSM geocoding API |

Two ready-to-use example queries:

```sql
-- Coverage gap: schools with no toilet within 500m
SELECT s.id, s.name
FROM assets s
WHERE s.asset_type = 'school'
AND NOT EXISTS (
  SELECT 1 FROM assets t
  WHERE t.asset_type = 'toilet'
  AND ST_DWithin(s.location::geography, t.location::geography, 500)
);

-- Issues per ward, ranked (drives the hotspot dashboard)
SELECT w.name, COUNT(i.id) AS issue_count
FROM wards w
JOIN issues i ON ST_Within(i.location, w.boundary)
GROUP BY w.name
ORDER BY issue_count DESC;
```

**On server load:** the hotspot and coverage-gap queries above are the most expensive in the system. Running them on every dashboard view would be the single biggest driver of server usage — instead, run them on a schedule (nightly) or on an explicit "refresh analytics" action from the admin view, and serve the cached result the rest of the time.

---

## 10. Development Workflow

1. **Select the pilot village/ward** — confirm access and a local contact (panchayat member, NGO, or school).
2. **Survey the area** — collect GPS points, photos, and known issues across all major asset categories.
3. **Load the data** — bulk-insert into PostGIS via the survey app or a CSV import script.
4. **Build the map layers** — render each asset type as a toggleable Leaflet layer.
5. **Add reporting + status logic** — let residents/volunteers submit and track issues.
6. **Run analytics** — hotspot and coverage-gap queries surface what to prioritize.
7. **Demo and validate** — present the working prototype to stakeholders and record feedback.

---

## 11. Team Structure (8 Roles)

| # | Role | Responsibilities | Key Deliverable |
|---|---|---|---|
| 1 | UI/UX & Frontend Lead | Mobile-first design system, React components, responsive layouts | App UI |
| 2 | Backend/API Lead | REST endpoints, auth, business logic | API service |
| 3 | Database/GIS Lead | Schema, PostGIS setup, spatial queries | DB + migrations |
| 4 | Map Integration Lead | Leaflet layers, GeoJSON rendering, offline tile caching | Map component |
| 5 | PWA/Offline-Sync Lead | Service worker, IndexedDB sync engine, offline queue & conflict handling | Offline-sync layer |
| 6 | Analytics Lead | Hotspot/coverage-gap logic, charts | Analytics module |
| 7 | QA/DevOps Lead | Testing, CI/CD, deployment | Test suite + live deploy |
| 8 | Docs/Presentation Lead | Documentation, report writing, demo prep | Final report + slides |

---

## 12. 14-Week Timeline

| Week | Phase | Key Activities |
|---|---|---|
| 1 | Kickoff | Village selection, stakeholder intro, scope lock |
| 2 | Requirements | Asset/issue categories finalized, wireframes |
| 3 | Design | DB schema, API contract |
| 4 | Setup | Repo, PostGIS DB (e.g. Supabase), PWA scaffold + service worker, CI |
| 5 | Core Build 1 | Auth, asset CRUD API, base map with layers |
| 6 | Core Build 2 | Issue reporting form + API, photo upload |
| 7 | Field Survey Round 1 | Collect real geotagged asset data |
| 8 | Core Build 3 | Admin dashboard, ward-wise counts |
| 9 | Core Build 4 | Hotspot/coverage-gap module |
| 10 | Field Survey Round 2 | Validate data, collect resident issue reports |
| 11 | Reporting | PDF export, analytics polish |
| 12 | Integration & Testing | End-to-end testing, bug fixes |
| 13 | Stakeholder Demo | Present to panchayat/faculty, gather feedback |
| 14 | Finalize | Polish, documentation, viva prep |

---

## 13. Deliverables Checklist

- Working PWA (deployed, installable from a link/QR code, works offline)
- Same app doubles as the field-survey tool and the admin dashboard — no separate builds
- Geotagged asset dataset for the pilot ward
- Interactive map with toggleable layers
- Issue reporting + status-tracking workflow
- Hotspot and coverage-gap analytics
- Ward-level PDF report export
- Field-validation writeup with stakeholder feedback
- Final presentation deck + demo

---

## 14. Success Metrics

- **Coverage:** % of known public assets in the pilot ward geotagged (target ≥90%)
- **Adoption:** number of issues logged during the project
- **Performance:** dashboard loads a 500+ point map in under 2 seconds
- **Accuracy:** GPS error documented, <10m for 90% of points
- **Stakeholder response:** qualitative feedback score from the demo/field validation

---

## 15. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| GPS inaccuracy in dense/covered areas | Mislabeled assets | Manual correction UI; cross-check against basemap |
| Limited/no internet in the village | Can't submit forms live | Local-first PWA — every screen works offline by default, background sync on reconnect |
| Low-end/older Android phones | Slow load, limited storage | Keep app bundle small, lazy-load admin-only screens, cap local tile cache with LRU eviction |
| Low resident participation | Sparse issue data | Involve local volunteers; multilingual UI |
| Team schedule conflicts | Missed milestones | Weekly standup + shared task board |
| Scope creep | Missed deadline | Freeze MVP scope after Week 4; log extras as stretch goals |
| Complainant privacy | Trust/adoption issues | Optional anonymous reporting; PII visible to admins only |

---

## 16. Social Impact

CivicLens turns undocumented, word-of-mouth complaints into structured, mappable data — which is what actually lets a panchayat or NGO plan: where drainage work is most urgent, which hamlet lacks a toilet within reach, where waste is piling up. It doesn't replace local governance, it gives it something concrete to point at.

---

## 17. Stretch Goals (Post-MVP)

- Rule-based → ML priority scoring (severity + frequency + affected population)
- SMS/IVR reporting for residents without smartphones
- Local-language UI toggle
- Public transparency view — residents track their own report's status
- Export hooks for e-governance portal integration
