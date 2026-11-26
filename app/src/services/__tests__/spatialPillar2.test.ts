import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistance,
  calculateCompassBearing,
} from '../offlineDedup';
import {
  computeHammingDistance,
} from '../edgeVision';

describe('Pillar 2: Client-side Offline Dedup & Vision Helpers', () => {
  it('calculates Haversine distance correctly on mobile client', () => {
    const lat1 = 12.9716;
    const lon1 = 77.5946;
    const lat2 = 12.9718; // ~22.2m north
    const lon2 = 77.5946;

    const dist = calculateHaversineDistance(lat1, lon1, lat2, lon2);
    expect(dist).toBeGreaterThan(20);
    expect(dist).toBeLessThan(25);
  });

  it('calculates compass bearing correctly and returns null for collocated coordinates', () => {
    // Heading due East
    const bearingEast = calculateCompassBearing(12.0, 77.0, 12.0, 77.01);
    expect(bearingEast).toBe(90);

    // Heading due South
    const bearingSouth = calculateCompassBearing(12.01, 77.0, 12.0, 77.0);
    expect(bearingSouth).toBe(180);

    // Exact same location (<1m)
    const bearingSame = calculateCompassBearing(12.0, 77.0, 12.0, 77.0);
    expect(bearingSame).toBeNull();
  });

  it('computes hamming distance correctly between 64-bit hex strings', () => {
    const h1 = '1234567890abcdef';
    const h2 = '1234567890abcdef'; // 0 distance
    expect(computeHammingDistance(h1, h2)).toBe(0);

    // Flip 1 bit: f (1111) -> e (1110)
    const h3 = '1234567890abcdee';
    expect(computeHammingDistance(h1, h3)).toBe(1);
  });
});
