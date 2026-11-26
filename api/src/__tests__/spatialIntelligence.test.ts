import { describe, it, expect } from 'vitest';
import {
  haversineDistanceMeters,
  calculateBearingDegrees,
  calculatePriorityScore,
} from '../services/spatialDedupService';
import {
  computeDHashFromGrayscale,
  calculateHammingDistance,
  calculateVisualSeverity,
  validateCaptureAuthenticity,
  classifyRuralIssuePhoto,
} from '../services/visionService';
import {
  calculateVulnerabilityScoringIndex,
} from '../services/waterloggingService';

describe('Pillar 2: Spatial Intelligence & GIS Unit Tests', () => {
  describe('Spatial Deduplication Geometry (Haversine & Bearing)', () => {
    it('accurately calculates distance within 30m threshold', () => {
      // 0.0001 degrees lat is approx 11.1 meters
      const lat1 = 28.6139;
      const lon1 = 77.2090;
      const lat2 = 28.6140; // ~11.1m north
      const lon2 = 77.2090;

      const distance = haversineDistanceMeters(lat1, lon1, lat2, lon2);
      expect(distance).toBeGreaterThan(10);
      expect(distance).toBeLessThan(13);
      expect(distance).toBeLessThan(30); // within 30m deduplication radius
    });

    it('detects when distance exceeds 30m threshold', () => {
      const lat1 = 28.6139;
      const lon1 = 77.2090;
      const lat2 = 28.6145; // ~66m north
      const lon2 = 77.2090;

      const distance = haversineDistanceMeters(lat1, lon1, lat2, lon2);
      expect(distance).toBeGreaterThan(30);
    });

    it('computes cardinal bearing degrees accurately and respects collocation guard', () => {
      // Point 2 is directly North of Point 1 -> bearing should be ~0 or 360
      const bearingNorth = calculateBearingDegrees(20.0, 75.0, 20.01, 75.0);
      expect(bearingNorth).not.toBeNull();
      expect(bearingNorth!).toBeCloseTo(0, 0);

      // Point 2 is directly East of Point 1 -> bearing should be ~90
      const bearingEast = calculateBearingDegrees(20.0, 75.0, 20.0, 75.01);
      expect(bearingEast).not.toBeNull();
      expect(bearingEast!).toBeCloseTo(90, 0);

      // Collocated point (<1m away) -> returns null to display "At your exact location"
      const bearingCollocated = calculateBearingDegrees(20.0, 75.0, 20.0, 75.0);
      expect(bearingCollocated).toBeNull();
    });

    it('calculates dynamic priority score with upvotes and asset proximity', () => {
      // Base critical issue with 1 upvote
      const baseCritical = calculatePriorityScore('critical', 1, false);
      expect(baseCritical).toBe(80.0); // 75 + 5

      // Base critical issue with 7 upvotes and nearby PHC / school asset (+15)
      const boostedCritical = calculatePriorityScore('critical', 7, true);
      // upvote bonus = min(25, log2(8)*5) = 15
      // 75 + 15 + 15 = 105 -> capped at 100
      expect(boostedCritical).toBe(100.0);

      // Low severity with 1 upvote
      const baseLow = calculatePriorityScore('low', 1, false);
      expect(baseLow).toBe(20.0); // 15 + 5
    });
  });

  describe('Lightweight Edge Computer Vision (pHash, Severity, EXIF)', () => {
    it('computes 64-bit dHash from 9x8 luminance sample', () => {
      // Create a gradient sample 9x8 where left pixel is always brighter than right
      const gradientPixels: number[] = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 9; c++) {
          gradientPixels.push(255 - c * 20); // strictly decreasing
        }
      }

      const hash = computeDHashFromGrayscale(gradientPixels);
      expect(hash).toHaveLength(16);
      expect(typeof hash).toBe('string');
      // Since left > right for all 64 comparisons, every bit should be 1 -> "ffffffffffffffff"
      expect(hash).toBe('ffffffffffffffff');
    });

    it('detects duplicate images via Hamming distance <= 6', () => {
      const hash1 = 'ffffffffffffffff';
      const hash2 = 'fffffffffffffffe'; // 1 bit flip
      const distance = calculateHammingDistance(hash1, hash2);
      expect(distance).toBe(1);
      expect(distance).toBeLessThanOrEqual(6); // duplicate detected!

      const invertedHash = '0000000000000000';
      const maxDistance = calculateHammingDistance(hash1, invertedHash);
      expect(maxDistance).toBe(64); // completely different
      expect(maxDistance).toBeGreaterThan(6);
    });

    it('scores visual severity and attaches waterborne hazard flags for leaking handpumps', () => {
      const result = calculateVisualSeverity(
        'dry_leaking_handpump',
        0.6,  // large damage area
        true, // stagnant water pool present
        0.5
      );

      expect(result.severityLevel).toBe('critical');
      expect(result.severityScore).toBeGreaterThanOrEqual(80);
      expect(result.hazardFlags).toContain('WATERBORNE_DISEASE_VECTOR');
    });

    it('attaches transit disruption flag for large potholes', () => {
      const result = calculateVisualSeverity('pothole', 0.5, true, 0.7);
      expect(result.hazardFlags).toContain('ROAD_TRANSIT_DISRUPTION');
      expect(result.hazardFlags).toContain('SUBMERGED_POTHOLE_COLLAPSE_HAZARD');
    });

    it('flags capture authenticity when photo exceeds 30 days old', () => {
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      const auth = validateCaptureAuthenticity({
        hasGps: true,
        captureTimestamp: fortyDaysAgo,
        isLikelyLiveCapture: false,
      });

      expect(auth.isAuthentic).toBe(false);
      expect(auth.warning).toContain('30 days ago');
    });

    it('classifies rural issue photo through the thin API pipeline', async () => {
      const result = await classifyRuralIssuePhoto({
        claimedCategory: 'Drinking Handpump Broken',
        precomputedFeatures: {
          damageAreaRatio: 0.55,
          edgeRoughness: 0.60,
          waterStagnant: true,
          dHash: '1234567890abcdef',
        },
      });

      expect(result.category).toBe('dry_leaking_handpump');
      expect(result.confidence).toBeGreaterThan(0.85);
      expect(result.waterStagnationDetected).toBe(true);
      expect(result.suggestedSeverity).toBe('critical');
      expect(result.photoPhash).toBe('1234567890abcdef');
    });
  });

  describe('Monsoon Waterlogging & Vulnerability Analysis (VSI Index)', () => {
    it('computes CRITICAL vulnerability for deep depression with choked drainage', () => {
      const result = calculateVulnerabilityScoringIndex({
        relativeDepressionDepthM: 1.2, // >1m deep bowl
        nearestDrainDistanceM: 20,
        drainCondition: 'severely_choked', // backflow hazard!
        soilType: 'clayey_black_cotton',   // impermeable swelling clay
        historicalWaterloggingIssueCount: 4,
      });

      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.vsiScore).toBeGreaterThanOrEqual(75);
      expect(result.recommendedAction).toContain('EMERGENCY');
    });

    it('computes LOW vulnerability for ridge asset with clean proximate drain', () => {
      const result = calculateVulnerabilityScoringIndex({
        relativeDepressionDepthM: 0.0, // elevated ridge
        nearestDrainDistanceM: 15,
        drainCondition: 'clear',       // unobstructed
        soilType: 'sandy_porous',      // fast infiltration
        historicalWaterloggingIssueCount: 0,
      });

      expect(result.riskLevel).toBe('LOW');
      expect(result.vsiScore).toBeLessThan(35);
      expect(result.recommendedAction).toContain('routine seasonal inspection');
    });

    it('calculates MODERATE vulnerability for alluvial soil with moderate distance to drain', () => {
      const result = calculateVulnerabilityScoringIndex({
        relativeDepressionDepthM: 0.3,
        nearestDrainDistanceM: 40,
        drainCondition: 'partially_silted',
        soilType: 'alluvial_loam',
        historicalWaterloggingIssueCount: 1,
      });

      expect(result.riskLevel).toBe('MODERATE');
      expect(result.vsiScore).toBeGreaterThanOrEqual(35);
      expect(result.vsiScore).toBeLessThan(55);
    });
  });
});
