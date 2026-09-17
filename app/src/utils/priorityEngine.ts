import type { LocalAsset, LocalIssue } from '../db';

export type PriorityRank = 'P1' | 'P2' | 'P3' | 'P4';

export interface PriorityEvaluation {
  score: number;
  rank: PriorityRank;
  label: string;
  badgeClass: string;
  slaDays: number;
  breakdown: {
    severityScore: number;
    categoryScore: number;
    ageScore: number;
    proximityScore: number;
    nearVulnerableAsset?: string;
  };
}

/**
 * Calculates great-circle distance between two lat/lng coordinates in meters using the Haversine formula.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const SEVERITY_SCORES: Record<string, number> = {
  critical: 40,
  high: 30,
  medium: 20,
  low: 10,
};

const CATEGORY_WEIGHTS: Record<string, number> = {
  'Water Supply': 25,
  'Public Sanitation': 20,
  'Health (PHC)': 20,
  'School / Anganwadi': 15,
  'Roads & Drains': 10,
  'Street Lighting': 10,
};

const VULNERABLE_ASSET_TYPES = new Set(['school', 'anganwadi', 'phc']);

/**
 * Deterministically evaluates an issue's priority based on:
 * 1. Severity points (10-40)
 * 2. Service criticality category (10-25)
 * 3. Age / elapsed days factor (+1.5 pts/day, up to 20)
 * 4. Proximity to vulnerable infrastructure (school/anganwadi/PHC within 300m: +15)
 */
export function evaluateIssuePriority(
  issue: Pick<LocalIssue, 'category' | 'severity' | 'date_reported' | 'latitude' | 'longitude'>,
  assets: LocalAsset[] = []
): PriorityEvaluation {
  // 1. Severity
  const sevKey = (issue.severity || 'medium').toLowerCase();
  const severityScore = SEVERITY_SCORES[sevKey] ?? 20;

  // 2. Category Criticality
  const categoryScore = CATEGORY_WEIGHTS[issue.category] ?? 10;

  // 3. Aging factor
  let daysOld = 0;
  if (issue.date_reported) {
    const reportedTime = new Date(issue.date_reported).getTime();
    const now = Date.now();
    if (!Number.isNaN(reportedTime) && reportedTime <= now) {
      daysOld = Math.max(0, Math.floor((now - reportedTime) / (1000 * 60 * 60 * 24)));
    }
  }
  const ageScore = Math.min(20, Math.round(daysOld * 1.5));

  // 4. Proximity to vulnerable sites (schools, anganwadis, health centres)
  let proximityScore = 0;
  let nearVulnerableAsset: string | undefined;

  for (const asset of assets) {
    if (VULNERABLE_ASSET_TYPES.has(asset.asset_type.toLowerCase())) {
      const dist = calculateDistanceMeters(
        issue.latitude,
        issue.longitude,
        asset.latitude,
        asset.longitude
      );
      if (dist <= 300) {
        proximityScore = 15;
        nearVulnerableAsset = `${asset.name || asset.asset_type.toUpperCase()} (~${Math.round(dist)}m)`;
        break;
      }
    }
  }

  // Aggregate and clamp to 0..100
  const rawScore = severityScore + categoryScore + ageScore + proximityScore;
  const score = Math.min(100, Math.max(0, rawScore));

  let rank: PriorityRank;
  let label: string;
  let badgeClass: string;
  let slaDays: number;

  if (score >= 75) {
    rank = 'P1';
    label = 'P1 · Emergency';
    badgeClass = 'priority-p1';
    slaDays = 2;
  } else if (score >= 55) {
    rank = 'P2';
    label = 'P2 · High';
    badgeClass = 'priority-p2';
    slaDays = 5;
  } else if (score >= 35) {
    rank = 'P3';
    label = 'P3 · Medium';
    badgeClass = 'priority-p3';
    slaDays = 14;
  } else {
    rank = 'P4';
    label = 'P4 · Low';
    badgeClass = 'priority-p4';
    slaDays = 30;
  }

  return {
    score,
    rank,
    label,
    badgeClass,
    slaDays,
    breakdown: {
      severityScore,
      categoryScore,
      ageScore,
      proximityScore,
      nearVulnerableAsset,
    },
  };
}
