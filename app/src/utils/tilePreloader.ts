// Tile Preloader Utility for Offline GIS Map Preloading

export interface TileBounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

// Convert lat/lng to OpenStreetMap tile X/Y coordinates
export function latLngToTileXY(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

export interface PreloadProgress {
  total: number;
  completed: number;
  failed: number;
  percent: number;
}

/**
 * Preload and cache raster map tiles for a specified geographic bounding box and zoom range.
 */
export async function preloadMapTiles(
  bounds: TileBounds,
  minZoom = 13,
  maxZoom = 16,
  onProgress?: (progress: PreloadProgress) => void
): Promise<{ total: number; cached: number }> {
  const tileUrls: string[] = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    const sw = latLngToTileXY(bounds.minLat, bounds.minLng, z);
    const ne = latLngToTileXY(bounds.maxLat, bounds.maxLng, z);

    const minX = Math.min(sw.x, ne.x);
    const maxX = Math.max(sw.x, ne.x);
    const minY = Math.min(sw.y, ne.y);
    const maxY = Math.max(sw.y, ne.y);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const sub = ['a', 'b', 'c'][(x + y) % 3];
        tileUrls.push(`https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`);
      }
    }
  }

  const total = tileUrls.length;
  let completed = 0;
  let failed = 0;

  // Open a named Cache Storage bucket for durable offline tile persistence.
  // This survives app restarts on Capacitor Android (unlike the volatile HTTP cache).
  const CACHE_NAME = 'civiclens-map-tiles-v1';
  const tileCache = typeof window !== 'undefined' && 'caches' in window
    ? await window.caches.open(CACHE_NAME).catch(() => null)
    : null;

  // Process downloads in concurrent batches of 6 to respect browser connection limits
  const BATCH_SIZE = 6;
  for (let i = 0; i < tileUrls.length; i += BATCH_SIZE) {
    const batch = tileUrls.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (url) => {
        try {
          if (tileCache) {
            // Check Cache Storage first to avoid re-downloading already-cached tiles
            const cached = await tileCache.match(url);
            if (cached) {
              completed++;
              return;
            }
            // Fetch fresh from network and persist in Cache Storage
            const response = await fetch(url, { mode: 'cors' });
            if (response.ok) {
              await tileCache.put(url, response);
              completed++;
            } else {
              failed++;
            }
          } else {
            // Fallback: plain network fetch (no durable cache on this platform)
            const response = await fetch(url, { mode: 'cors' });
            if (response.ok) {
              completed++;
            } else {
              failed++;
            }
          }
        } catch {
          failed++;
        }
      })
    );

    if (onProgress) {
      onProgress({
        total,
        completed,
        failed,
        percent: Math.round(((completed + failed) / total) * 100),
      });
    }
  }

  return { total, cached: completed };
}
