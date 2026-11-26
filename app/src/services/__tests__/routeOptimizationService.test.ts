import { describe, it, expect } from 'vitest';
import {
  calculateRuralDistanceKm,
  checkSegmentCrossesBarrier,
  computeTicketPriorityScore,
  optimizeMaintenanceRoute,
  buildPgRoutingTspQuery,
  type MaintenanceTicket,
  type DepotLocation,
  type PhysicalBarrier,
} from '../routeOptimizationService';

describe('routeOptimizationService', () => {
  describe('calculateRuralDistanceKm', () => {
    it('returns 0 for identical coordinates', () => {
      expect(calculateRuralDistanceKm(25.3176, 82.9739, 25.3176, 82.9739)).toBe(0);
    });

    it('calculates distance factoring in rural tortuosity factor (~1.35x)', () => {
      // Points approximately 1.1 km straight-line distance apart
      const distKm = calculateRuralDistanceKm(25.3176, 82.9739, 25.3276, 82.9739);
      expect(distKm).toBeGreaterThan(1.2);
      expect(distKm).toBeLessThan(2.0);
    });

    it('adds physical barrier detour penalty when path crosses an unbridged canal', () => {
      // Canal barrier running horizontally across latitude 25.3200
      const canalBarrier: PhysicalBarrier = {
        id: 'canal-1',
        name: 'Main Irrigation Canal',
        p1: [25.3200, 82.9600],
        p2: [25.3200, 82.9900],
        detourPenaltyKm: 4.5,
      };

      // Segment going from 25.3176 to 25.3276 crosses latitude 25.3200
      const crosses = checkSegmentCrossesBarrier(25.3176, 82.9739, 25.3276, 82.9739, canalBarrier);
      expect(crosses).toBe(true);

      const distWithoutBarrier = calculateRuralDistanceKm(25.3176, 82.9739, 25.3276, 82.9739);
      const distWithBarrier = calculateRuralDistanceKm(25.3176, 82.9739, 25.3276, 82.9739, [canalBarrier]);

      expect(distWithBarrier).toBeCloseTo(distWithoutBarrier + 4.5, 1);
    });
  });

  describe('computeTicketPriorityScore', () => {
    it('ranks critical water issues higher than low issues', () => {
      const criticalWater: MaintenanceTicket = {
        id: 't-1',
        category: 'water',
        severity: 'critical',
        latitude: 25.31,
        longitude: 82.97,
        daysPending: 5,
        assetType: 'handpump',
      };

      const lowIssue: MaintenanceTicket = {
        id: 't-2',
        category: 'road',
        severity: 'low',
        latitude: 25.32,
        longitude: 82.98,
        daysPending: 1,
      };

      const scoreCritical = computeTicketPriorityScore(criticalWater);
      const scoreLow = computeTicketPriorityScore(lowIssue);

      expect(scoreCritical).toBeGreaterThan(scoreLow * 3);
    });
  });

  describe('optimizeMaintenanceRoute (Offline 2-Opt TSP)', () => {
    const depot: DepotLocation = {
      id: 'depot-gp-bhawan',
      name: 'Gram Panchayat Bhawan',
      latitude: 25.3176,
      longitude: 82.9739,
    };

    const tickets: MaintenanceTicket[] = [
      {
        id: 't-1',
        category: 'water',
        severity: 'critical',
        latitude: 25.319,
        longitude: 82.975,
        daysPending: 7,
        assetType: 'handpump',
      },
      {
        id: 't-2',
        category: 'lighting',
        severity: 'low',
        latitude: 25.335,
        longitude: 82.99,
        daysPending: 1,
        assetType: 'streetlight',
      },
      {
        id: 't-3',
        category: 'sanitation',
        severity: 'high',
        latitude: 25.325,
        longitude: 82.98,
        daysPending: 4,
        assetType: 'drainage',
      },
    ];

    it('returns an empty route when no tickets are provided', () => {
      const result = optimizeMaintenanceRoute(depot, []);
      expect(result.stops.length).toBe(0);
      expect(result.totalDistanceKm).toBe(0);
      expect(result.isShiftFeasible).toBe(true);
    });

    it('prioritizes urgent water issues and generates feasible tour', () => {
      const result = optimizeMaintenanceRoute(depot, tickets, 480);

      expect(result.stops.length).toBe(3);
      expect(result.unservedTickets.length).toBe(0);
      expect(result.isShiftFeasible).toBe(true);
      expect(result.totalDistanceKm).toBeGreaterThan(0);
      expect(result.totalShiftTimeMin).toBeGreaterThan(0);

      // Verify first stop is the critical water ticket
      expect(result.stops[0].ticketId).toBe('t-1');
    });

    it('flags unserved tickets when total shift time exceeds work limits', () => {
      // Restrict maximum shift time to only 45 minutes
      const result = optimizeMaintenanceRoute(depot, tickets, 45);

      expect(result.unservedTickets.length).toBeGreaterThan(0);
      expect(result.isShiftFeasible).toBe(false);
    });
  });

  describe('buildPgRoutingTspQuery', () => {
    it('generates valid SQL incorporating pgr_dijkstraCostMatrix and pgr_tsp', () => {
      const sql = buildPgRoutingTspQuery(4, 25.3176, 82.9739, ['uuid-1', 'uuid-2']);

      expect(sql).toContain('pgr_dijkstraCostMatrix');
      expect(sql).toContain('pgr_tsp');
      expect(sql).toContain('ward_id = 4');
      expect(sql).toContain("'uuid-1','uuid-2'");
    });
  });
});
