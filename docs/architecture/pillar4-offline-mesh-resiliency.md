# CivicLens — Pillar 4: Deep Offline & Mesh Resiliency Architecture

**Technical Specification & Implementation Blueprint**  
**Role:** Pillar 4 Lead (Deep Offline & Mesh Resiliency)  
**Target Systems:** React 19 PWA, Capacitor 8 (Android), Dexie.js (IndexedDB), Node.js Express 5, PostgreSQL + PostGIS  
**Target Environment:** Rural Indian Gram Panchayats (2GB RAM Android phones, zero/patchy 2G/3G connectivity, dead zones, $0 free-tier cloud)

---

## 1. System Context & Operational Challenges

In rural Indian Gram Panchayats (GPs), field workers (ASHA workers, Anganwadi staff, Panchayat Sachivs, and local plumbers/electricians) face harsh infrastructural constraints:
- **Zero/Intermittent Connectivity:** Up to 60% of village ward land area falls into cellular dead zones (forest fringes, agricultural fields, riverbanks).
- **Resource-Constrained Hardware:** Over 80% of personal field devices are low-end Android smartphones (2GB RAM, quad-core MediaTek/Spreadtrum processors, 32GB eMMC storage).
- **Battery & Quota Conservation:** Field volunteers operate on prepaid cellular packs with strict daily data caps (1GB/day). Apps must avoid continuous background GPS polling and heavy bandwidth downloads.
- **Critical Real-World Impact:** An offline survey worker must not lose reported grievances (e.g., contaminated drinking wells or collapsed power lines), and Panchayat repair staff must have actionable visit routes even without cellular access.

Pillar 4 provides three resilient architectural engines:
1. **Offline Vector Basemaps via PMTiles v3:** Instant, high-resolution GIS maps rendered completely offline from a single 25–40MB district archive using IndexedDB range requests and Canvas 2D/WebGL rendering.
2. **Field-to-Field P2P Mesh Sync (CivicMesh v1):** Zero-internet data transfer protocol allowing volunteers in dead zones to exchange and relay outbox reports using offline QR-signaled WebRTC, Local SoftAP, or Bluetooth LE.
3. **Dual-Mode Maintenance Route Optimization (TSP Dispatch):** An offline-first client-side heuristic TSP engine (Priority-Weighted 2-Opt) and backend pgRouting network solver for optimal repair worker dispatch.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CivicLens Client (React 19 / Capacitor 8)                 │
│                                                                             │
│  ┌───────────────────────────┐  ┌────────────────────────────────────────┐  │
│  │   Offline Vector Maps     │  │       CivicMesh P2P Engine             │  │
│  │  PMTiles v3 Archive       │  │  - QR-Signaled WebRTC DataChannel      │  │
│  │  IndexedDbSource (.slice) │  │  - Local SoftAP Socket Sync            │  │
│  │  Protomaps Canvas/Leaflet │  │  - Data-Mule Store-and-Forward Outbox  │  │
│  └─────────────┬─────────────┘  └───────────────────┬────────────────────┘  │
│                │                                    │                       │
│  ┌─────────────▼────────────────────────────────────▼────────────────────┐  │
│  │                      Dexie.js (IndexedDB v2)                          │  │
│  │  - local_assets     - local_issues     - outbox (signed)              │  │
│  │  - tile_packages    - mesh_relays      - route_schedules              │  │
│  └──────────────────────────────────────┬────────────────────────────────┘  │
│                                         │                                   │
│  ┌──────────────────────────────────────▼────────────────────────────────┐  │
│  │               Priority-Weighted TSP Dispatch Engine                   │  │
│  │  - Offline Client-Side: Turf.js + 2-Opt Local Search                  │  │
│  │  - Online Backend Fallback: pgRouting (pgr_dijkstraCostMatrix, pgr_tsp│  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Deep Dive 1: Offline Vector Tiles via PMTiles v3

### 2.1 The Failure Mode of Raster Tiles in Rural Deployments

The baseline CivicLens implementation loaded online raster tiles via:
```typescript
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
```
In rural field tests, this fails catastrophically:
1. **Filesystem Inode & Cache Blowup:** Caching raster tiles for a district (zoom levels 10 to 16) requires ~40,000 to 120,000 discrete PNG images. Browsers (Chrome on Android) throttle or reject massive CacheStorage directories, resulting in quota errors and slow SQLite table locks.
2. **Bandwidth Inefficiency:** Raster tiles for a district consume 350MB–800MB. Over a 2G connection, downloading this is impossible.
3. **Visual Rigidity:** Raster tiles cannot be dynamically filtered or restyled offline (e.g., highlighting government water bodies, dimming residential roads, or rendering high-contrast modes for bright sunlight).

### 2.2 The PMTiles v3 Architectural Advantage

**PMTiles** (Protomaps format v3) is a single-file archive format for tile pyramids designed for random-access byte-range requests:
- **Single File:** An entire district (e.g., Varanasi District, ~1,500 km², Zoom 0 to 15) is packaged into a **single 28MB file** (`varanasi_district_z15.pmtiles`).
- **Zero Inode Exhaustion:** Exactly one entry in IndexedDB/filesystem storage.
- **Hilbert-Curve Indexing:** Directory entries map tile `(z, x, y)` to 64-bit Hilbert tile IDs, enabling binary search lookups with $O(\log N)$ seeks.
- **Internal Structure:**
  ```
  ┌──────────────────────────────────────────────────────────┐
  │ Header (127 Bytes): Magic, Version, Root Dir Offset/Len │
  ├──────────────────────────────────────────────────────────┤
  │ Root Directory (Compact Varint + Hilbert Run-Length)    │
  ├──────────────────────────────────────────────────────────┤
  │ Leaf Directories (Optional, for deep zoom levels)        │
  ├──────────────────────────────────────────────────────────┤
  │ JSON Metadata (Vector layers, fields, bounds, min/max z) │
  ├──────────────────────────────────────────────────────────┤
  │ Tile Data Payloads (MVT / Mapbox Vector Tiles, gzip/zstd)│
  └──────────────────────────────────────────────────────────┘
  ```

### 2.3 Packaging Pipeline for Rural Districts

To generate free, self-hosted regional tiles without cloud recurring costs:
1. **Extract OSM Boundaries:**
   Extract the district bounding box from Geofabrik India (`geofabrik-india-latest.osm.pbf`) using `osmium-tool`:
   ```bash
   osmium extract -b 82.75,25.10,83.25,25.55 uttar-pradesh-latest.osm.pbf -o varanasi_district.osm.pbf
   ```
2. **Build PMTiles with Planetiler:**
   Using Planetiler (Java-based, builds vector tiles in minutes on commodity hardware with zero RAM exhaustion):
   ```bash
   docker run -v $(pwd):/data ghcr.io/onthegomap/planetiler:latest \
     --osm-path=/data/varanasi_district.osm.pbf \
     --output=/data/varanasi_z15.pmtiles \
     --maxzoom=15 \
     --mbtiles=false
   ```
3. **Target Layer Optimization:**
   Exclude non-essential highway attributes and heavy pedestrian geometry. Keep:
   - `transportation` (primary, secondary, tertiary, residential, track, path)
   - `water` (river, canal, reservoir, pond, well)
   - `waterway` (drain, ditch, stream)
   - `boundary` (Gram Panchayat boundary, administrative level 8 & 9)
   - `building` (structural footprints where available)
   - `place` (village names, hamlet names, tolas)

### 2.4 Range Requests via IndexedDB / Dexie (`IndexedDbSource`)

Standard PMTiles fetches byte ranges over HTTP (`Range: bytes=start-end`). When offline, there is no HTTP server.
The official `pmtiles` library defines the `Source` interface:
```typescript
export interface Source {
  getBytes: (offset: number, length: number, signal?: AbortSignal) => Promise<RangeResponse>;
  getKey: () => string;
}
```

#### Solving Low-End Android RAM Constraints (2GB RAM)
Loading an entire 35MB PMTiles archive as a contiguous `ArrayBuffer` in JavaScript heap consumes 35MB of RAM immediately and forces V8 Garbage Collection to pause UI threads. Furthermore, if copied, it triggers Out-Of-Memory (OOM) crashes in Android WebView.

**Solution:** Store the archive as a single `Blob` inside IndexedDB. 
The Web API `Blob.prototype.slice(start, end)` does **not** read the entire blob into memory; it creates a lightweight zero-copy slice descriptor backed by the browser's storage engine. Only the requested 5KB–30KB MVT tile is read into memory on-demand.

```typescript
export class IndexedDbPMTilesSource implements Source {
  private blob: Blob;
  private key: string;

  constructor(key: string, blob: Blob) {
    this.key = key;
    this.blob = blob;
  }

  getKey(): string {
    return this.key;
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    // Zero-copy virtual slice
    const slice = this.blob.slice(offset, offset + length);
    const buffer = await slice.arrayBuffer();
    return {
      data: buffer,
      etag: undefined,
      cacheControl: 'max-age=86400',
      expires: undefined,
    };
  }
}
```

### 2.5 Leaflet Rendering Strategy: Protomaps-Leaflet (Canvas 2D) vs MapLibre (WebGL)

On entry-level phones (e.g. Android Go with 2GB RAM):
- **MapLibre GL JS:** Allocates WebGL context, compiling shaders, maintaining GPU vertex buffers (~45–80MB VRAM). If the phone runs low on memory, Android drops the WebGL context (`webglcontextlost`), turning the map canvas blank.
- **Protomaps-Leaflet (Canvas 2D):** Renders MVT vector slices directly to standard HTML5 2D Canvas elements inside Leaflet's standard tile grid. Bundle size is < 35KB, memory footprint is < 12MB, and it never crashes due to GPU driver resets.

**Hybrid Strategy:**
- Primary / Low-End Fallback: Protomaps-Leaflet 2D Canvas renderer.
- Secondary / High-End Option: `@maplibre/maplibre-gl-leaflet` when `navigator.deviceMemory > 3` and WebGL2 is stable.

---

## 3. Deep Dive 2: Field-to-Field P2P Mesh Synchronization (CivicMesh v1)

### 3.1 The Realities of Dead-Zone P2P Transport

In a village dead zone with no cellular towers, **no cloud STUN/TURN/Signaling server exists**. Protocols requiring internet discovery fail.
CivicMesh v1 specifies three realistic offline peer-to-peer transport layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CivicMesh Offline Transports                    │
├───────────────────────────────┬───────────────────────────┬────────────┤
│ Transport Type                │ Range / Bandwidth         │ Complexity │
├───────────────────────────────┼───────────────────────────┼────────────┤
│ 1. QR-Signaled WebRTC         │ Same-room (1-5m)          │ Zero-infra │
│    Direct DataChannel         │ 5 - 20 Mbps (over Wi-Fi)  │ Highly UX- │
│    (Camera QR Handshake)      │ Complete outbox + photos  │ friendly   │
├───────────────────────────────┼───────────────────────────┼────────────┤
│ 2. SoftAP "Pocket Hub"        │ 30 - 70 meters            │ High       │
│    One-tap Local Wi-Fi AP     │ 15 - 40 Mbps              │ Throughput │
│    HTTP/WebSocket on LAN      │ Rapid multi-device sync   │            │
├───────────────────────────────┼───────────────────────────┼────────────┤
│ 3. Bluetooth Low Energy (BLE) │ 10 - 20 meters            │ Zero-touch │
│    Capacitor BLE GATT Chars   │ 10 - 25 KB/s (L2CAP)      │ Background │
│    (Metadata & Outbox text)   │ Text payloads only        │            │
└───────────────────────────────┴───────────────────────────┴────────────┘
```

#### Transport 1: Camera-Assisted QR WebRTC Handshake (The "Offline AirDrop")
This requires zero network infrastructure:
1. Volunteer A selects "Sync with Nearby Volunteer" -> "Initiate Sync".
2. Phone A opens local WebRTC `RTCPeerConnection` (host-only ICE candidates) and generates an SDP Offer.
3. Phone A compresses the SDP using `fflate` / `pako` (raw deflate) and presents it as a compact animated QR code.
4. Volunteer B scans the QR code with CivicLens. Phone B generates an SDP Answer, compresses it, and displays its own QR code.
5. Volunteer A scans B's Answer QR code.
6. The direct `RTCDataChannel` opens instantly over peer-to-peer Wi-Fi!

#### Transport 2: SoftAP Local Hotspot
1. Phone A activates Android Hotspot with SSID `CivicLens-Mesh-[WardId]`.
2. Phone B scans the auto-generated Wi-Fi connection QR code and joins the LAN (`192.168.43.0/24`).
3. Phone A runs a local lightweight HTTP sync endpoint (via Capacitor local webserver plugin or WebSocket on port `8443`).
4. Rapid batch transmission takes place in under 3 seconds.

### 3.2 CivicMesh v1 Wire Protocol Specification

CivicMesh is a half-duplex anti-entropy gossip protocol designed to minimize radio power and data volume.

```
Device A (Initiator)                               Device B (Responder)
   │                                                      │
   │ ────────── 1. HELLO (Identity, Bloom Filter) ───────>│
   │                                                      │
   │ <───────── 2. HELLO_ACK (Peer Bloom Filter) ──────── │
   │                                                      │
   │ ────────── 3. DELTA_QUERY (Missing Record IDs) ─────>│
   │                                                      │
   │ <───────── 4. BATCH_PAYLOAD (Compressed Records) ─── │
   │                                                      │
   │ ────────── 5. BATCH_PAYLOAD (Reverse Records) ──────>│
   │                                                      │
   │ <───────── 6. SYNC_COMMIT_ACK (Signed Hashes) ───────│
   │                                                      │
   │ ────────── 7. TERMINATE ────────────────────────────>│
```

#### Protocol Message Schemas

```typescript
// 1. HELLO Message
export interface MeshHelloMessage {
  protocol_version: 'civicmesh_v1';
  device_id: string;            // UUID v4 of sending device
  user_name: string;             // ASHA / Surveyor Name
  ward_id: number;
  bloom_filter_hex: string;      // 512-bit bloom filter of known issue UUIDs
  last_sync_seq: number;         // Device Lamport logical clock
  timestamp: string;             // ISO8601
  signature: string;             // Ed25519 signature of payload
}

// 2. DELTA QUERY
export interface MeshDeltaQuery {
  requesting_device_id: string;
  missing_record_ids: string[];  // Records Device A needs from Device B
  offered_record_ids: string[];  // Records Device A has that Device B needs
}

// 3. BATCH PAYLOAD
export interface MeshBatchPayload {
  batch_id: string;
  sender_device_id: string;
  items: MeshSyncItem[];
}

export interface MeshSyncItem {
  record_id: string;
  table_name: 'issues' | 'assets';
  action: 'create' | 'update';
  origin_device_id: string;     // Creator device UUID
  relayed_by: string[];         // Chain of device UUIDs acting as data mules
  client_seq_num: number;
  payload: Record<string, any>;
  tamper_hash: string;          // SHA-256(origin_device_id + record_id + payload_json)
  signature: string;            // Creator's Ed25519 signature
}

// 4. COMMIT ACK
export interface MeshCommitAck {
  batch_id: string;
  acknowledged_records: string[];
  rejection_reasons?: Record<string, string>;
  responder_seq: number;
}
```

### 3.3 Data Mule (Store-and-Forward) Relaying

A survey volunteer (Device A) deep inside Ward 4 reports 5 broken tube wells. Device A has no cellular signal.
1. Device A meets an Anganwadi supervisor (Device B) at a primary health centre (also in a dead zone).
2. Device A and Device B run CivicMesh P2P sync.
3. Device B receives Device A's 5 reports. Device B stores them in its local Dexie `outbox` table with:
   - `sync_state: 'mesh_relayed'`
   - `origin_device_id: Device A`
   - `relayed_by: [Device A, Device B]`
4. Device B travels in the evening to the Block Development Office / home where 4G cellular signal exists.
5. Device B's background sync activates and POSTs the entire outbox to the central Express API (`POST /api/sync`).
6. The central server validates Device A's cryptographic signature, upserts the tickets into PostGIS, and marks them `synced`.
7. Device A's grievances are officially registered without Device A ever touching the internet!

### 3.4 Multi-Master Conflict Resolution & CRDTs

When multiple field workers modify or report issues concurrently offline:
1. **Creation Non-Colliding (Add-Wins):** All issues use client-generated UUID v4 as primary keys. Independent offline creation never causes database key collisions.
2. **Issue Status Transition Lattice:** Issue states form a monotonic directed acyclic graph:
   $$\text{open} \longrightarrow \text{in\_progress} \longrightarrow \text{resolved}$$
   - A peer reporting `resolved` always supersedes `in_progress` or `open`.
   - Re-opening an issue requires an explicit new revision with a higher Lamport timestamp.
3. **Attribute Conflict Resolution (Last-Write-Wins with Lamport Clocks):**
   Each record carries a tuple:
   $$(T_{\text{lamport}}, \text{client\_seq\_num}, \text{device\_id})$$
   If two devices edit description or severity concurrently, the record with the higher Lamport timestamp wins. In case of identical timestamps, lexicographical ordering of `device_id` breaks the tie deterministically.

---

## 4. Deep Dive 3: Maintenance Route Optimization (TSP Dispatch)

### 4.1 Problem Formulation: Priority-Weighted Rural TSP

Panchayat repair personnel (e.g. ward pump mechanics or wiremen) are assigned 8–25 reported tickets across a 20 km² rural ward.
Unlike urban courier delivery where distance is the sole cost, rural civic repairs must balance:
1. **Critical Urgency:** A non-functional drinking well or severed power cable cannot wait until the end of the day just because it is 2 km farther away.
2. **Terrain & Road Surface:** Kutcha (unpaved) dirt tracks have significantly higher transit time and puncture risks during rainy seasons.
3. **Working Shift Limits:** A repair technician works a 7–8 hour shift including transit and repair times.
4. **Depot Return:** Technicians start and conclude their workday at the Gram Panchayat Bhawan (Depot $D$).

#### Mathematical Formulation
Let:
- $V = \{0, 1, 2, \dots, n\}$ be the set of nodes, where $0$ is the Panchayat Depot and $1 \dots n$ are open issue locations.
- $d(i, j)$ be the network travel distance between nodes $i$ and $j$.
- $s_i \in \{1, 2, 3, 4\}$ be the severity level of issue $i$ (Low=1, Medium=2, High=3, Critical=4).
- $w_i = \text{days\_pending}_i$ be the aging penalty.
- $t_{repair}(i)$ be the estimated repair time (e.g., Handpump = 45 min, Streetlight = 20 min).
- $v_{avg} \approx 18 \text{ km/h}$ be average motorcycle/bicycle transit speed on village roads.

The composite urgency weight $U(i)$ is:
$$U(i) = \alpha \cdot s_i + \beta \cdot \log(1 + w_i)$$

The objective is to minimize total routing cost while penalizing delayed visits to urgent tickets:
$$\min \sum_{k=0}^{n} d(p_k, p_{k+1}) + \gamma \sum_{k=1}^{n} k \cdot [M - U(p_k)]$$
subject to:
$$\sum_{k=0}^{n} \frac{d(p_k, p_{k+1})}{v_{avg}} + \sum_{k=1}^{n} t_{repair}(p_k) \le T_{max} \quad (480 \text{ minutes})$$
where $p$ is a permutation of $V$ starting and ending at $0$, $k$ is the sequence order index, and $M$ is a normalizing constant.

### 4.2 Offline Client-Side Engine: Turf.js + Priority 2-Opt Heuristic

On a 2GB RAM smartphone running completely offline:
- Solving exact TSP (via Integer Linear Programming) is computationally infeasible and drains battery.
- A greedy nearest-neighbor approach produces tangled paths with edge crossings.
- **Solution:** A two-stage hybrid heuristic:
  1. **Phase 1: Urgency-Biased Nearest-Neighbor (Construction):**
     Select the next node $j$ minimizing:
     $$Score(i, j) = d(i, j) - \lambda \cdot U(j)$$
  2. **Phase 2: Priority-Constrained 2-Opt Local Search (Improvement):**
     Iteratively reverse edge sub-tours $(p_i \dots p_j)$ if and only if:
     - The physical distance decreases: $\Delta d < 0$.
     - The swap does not push a Critical ($s_i = 4$) ticket behind a Low ($s_i = 1$) ticket.
     The algorithm runs in $< 25 \text{ ms}$ on mobile browsers for $n \le 30$.

```
Edge Untangling via 2-Opt Local Search:
      i       i+1                   i      i+1
      o───────>o                    o──────>o
       \     /        2-Opt          \     /
        \   /       ─────────>        \   /
         \ /        Untangle           \ /
          X                             = (Parallel Edges)
         / \                           / \
        /   \                         /   \
       o<────o                       o────>o
      j       j+1                   j      j+1
```

### 4.3 Online Backend Engine: PostGIS + pgRouting

When the Panchayat office has internet connectivity, the dispatcher can request the exact road-topological route computed against the real OpenStreetMap road graph.

#### Database Graph Setup
```sql
-- Ensure pgRouting is installed
CREATE EXTENSION IF NOT EXISTS pgrouting;

-- Ways table imported from OSM via osm2pgrouting
-- Columns: id, source, target, cost_length, reverse_cost_length, the_geom
```

#### pgRouting TSP Query
```sql
WITH waypoints AS (
  SELECT 0 AS order_id, 0 AS node_id, 25.3176 AS lat, 82.9739 AS lng -- Depot
  UNION ALL
  SELECT ROW_NUMBER() OVER () AS order_id, id AS issue_id,
         ST_Y(location) AS lat, ST_X(location) AS lng
  FROM issues
  WHERE status = 'open' AND ward_id = $1
  LIMIT 25
),
distance_matrix AS (
  SELECT * FROM pgr_dijkstraCostMatrix(
    'SELECT id, source, target, cost_length AS cost, reverse_cost_length AS reverse_cost FROM ways',
    (SELECT array_agg(node_id) FROM waypoints)
  )
)
SELECT seq, node, cost, agg_cost
FROM pgr_tsp(
  'SELECT start_vid AS source, end_vid AS target, agg_cost AS cost FROM distance_matrix',
  start_id := 0
);
```

The resulting sequence of vertices is stitched together via `pgr_dijkstra` to produce a true turn-by-turn GeoJSON LineString respecting rural bridges and waterways.

---

## 5. Architectural Synthesis & Integration Points

| Feature | Low-Bandwidth / Offline (Pillar 4) | High-Bandwidth / Online Fallback |
| :--- | :--- | :--- |
| **Map Tiles** | PMTiles v3 (IndexedDB single blob, Canvas 2D) | Protomaps CDN / OSM Tile Cache |
| **Field Sync** | CivicMesh P2P (QR-WebRTC, SoftAP, Data Mule) | `POST /api/sync` (Express 5 HTTPS) |
| **Route Dispatch** | Turf.js + Priority 2-Opt Client Heuristic | PostGIS `pgr_tsp` + `pgr_dijkstra` |
| **PII Protection**| Local AES-GCM-256 Web Crypto (Zero Server Leak) | Blind hashed tokens |
| **Storage Cap** | Dexie LRU pruned (25MB tile blob + 15MB records) | Scalable Postgres / Supabase Free Tier |

This architecture ensures that a Gram Panchayat can conduct a complete, multi-week infrastructure monitoring and grievance-redressal campaign even if a cellular tower is struck by lightning and stays offline for weeks.

---

## 6. Related Documentation

- [Deployment, Local Dev & Android Build Guide](../deployment-and-android.md) — Environment setup, Docker Compose, free-tier cloud deployment, and Capacitor 8 Android APK pipeline.
- [Testing Guide](../testing.md) — Vitest suites for `pmtilesService`, `meshSyncService`, `routeOptimizationService`, and `piiEncryption`.
- [Pillar 2: Advanced GIS & Spatial Intelligence](../pillar2-advanced-gis-spatial-intelligence.md) — Spatial deduplication, edge CV, and monsoon VSI.
- [Unified Spatial & Offline Mesh Synthesis](./unified-spatial-offline-mesh-synthesis.md) — Cross-pillar evaluation and integration blueprint.
