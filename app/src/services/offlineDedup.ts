import { db, type LocalIssue, type OutboxItem } from '../db';

export interface OfflineDuplicateMatch {
  issue: LocalIssue;
  distanceMeters: number;
  bearingDegrees: number | null;
  isSameCategory: boolean;
}

/**
 * Calculates Haversine distance in meters between two coordinates.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Calculates compass bearing from point 1 to point 2 in degrees (0 - 360).
 * Collocation guard: Returns null if distance < 1m ("At your exact location").
 */
export function calculateCompassBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number | null {
  const dist = calculateHaversineDistance(lat1, lon1, lat2, lon2);
  if (dist < 1.0) {
    return null;
  }

  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return Math.round(((theta * 180) / Math.PI + 360) % 360);
}

/**
 * Checks IndexedDB local issues within 30m radius for offline deduplication.
 * Uses indexed status query to avoid loading thousands of resolved issues into RAM.
 */
export async function checkOfflineDuplicates(
  latitude: number,
  longitude: number,
  category?: string,
  radiusMeters: number = 30.0
): Promise<OfflineDuplicateMatch[]> {
  try {
    // IndexedDB index cursor on status: skips loading resolved issues into 2GB Android RAM
    const openIssues = await db.issues
      .where('status')
      .anyOf('open', 'in_progress')
      .toArray();

    const matches: OfflineDuplicateMatch[] = [];

    for (const issue of openIssues) {
      const distance = calculateHaversineDistance(
        latitude,
        longitude,
        issue.latitude,
        issue.longitude
      );

      if (distance <= radiusMeters) {
        const bearing = calculateCompassBearing(
          latitude,
          longitude,
          issue.latitude,
          issue.longitude
        );
        const isSameCategory = category
          ? issue.category.toLowerCase() === category.toLowerCase()
          : false;

        matches.push({
          issue,
          distanceMeters: distance,
          bearingDegrees: bearing,
          isSameCategory,
        });
      }
    }

    // Sort by same category first, then shortest distance
    matches.sort((a, b) => {
      if (a.isSameCategory && !b.isSameCategory) return -1;
      if (!a.isSameCategory && b.isSameCategory) return 1;
      return a.distanceMeters - b.distanceMeters;
    });

    return matches;
  } catch (err) {
    console.error('Error checking offline duplicates:', err);
    return [];
  }
}

/**
 * Queues a 1-tap corroboration/upvote into IndexedDB and outbox for offline sync.
 */
export async function queueOfflineCorroboration(params: {
  issueId: string;
  actionType?: 'upvote' | 'corroborate_still_present' | 'severity_worsened';
  notes?: string;
  photoUrl?: string;
  latitude: number;
  longitude: number;
  deviceFingerprint?: string;
}): Promise<void> {
  const {
    issueId,
    actionType = 'upvote',
    notes,
    photoUrl,
    latitude,
    longitude,
    deviceFingerprint,
  } = params;

  // 1. Update local issue if present in Dexie
  const existing = await db.issues.get(issueId);
  if (existing) {
    const currentCount = (existing as any).corroboration_count || 1;
    await db.issues.update(issueId, {
      ...existing,
      ...({ corroboration_count: currentCount + 1 } as any),
      sync_state: 'saved',
    });
  }

  // 2. Add corroboration record to Outbox table
  const outboxItem: OutboxItem = {
    record_id: issueId,
    table_name: 'issues',
    action: 'update',
    payload: {
      action: 'corroborate',
      issue_id: issueId,
      action_type: actionType,
      notes: notes || null,
      photo_url: photoUrl || null,
      latitude,
      longitude,
      device_fingerprint: deviceFingerprint || 'pwa-client',
    },
    client_seq_num: Date.now(),
    created_at: new Date().toISOString(),
  };

  await db.outbox.add(outboxItem);
}
