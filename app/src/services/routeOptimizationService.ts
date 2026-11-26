/**
 * CivicLens Maintenance Route Optimization Service (TSP Dispatch)
 * Pillar 4: Priority-Weighted Rural TSP Dispatch for Panchayat Repair Personnel
 *
 * Implements:
 * 1. Great-circle Haversine distance matrix with rural road tortuosity adjustment (tau = 1.35)
 * 2. Multi-factor Urgency Priority Scoring (Severity, Aging Days, Critical Infrastructure)
 * 3. Client-Side Heuristic: Urgency-Biased Nearest-Neighbor + Priority-Constrained 2-Opt
 * 4. Shift Feasibility Estimator (Travel time + Asset Repair Duration vs Max Shift)
 * 5. Backend pgRouting query builder (pgr_dijkstraCostMatrix, pgr_tsp)
 */

export interface MaintenanceTicket {
  id: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  latitude: number;
  longitude: number;
  daysPending: number;
  assetType?: string;
  description?: string;
}

export interface DepotLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface PhysicalBarrier {
  id: string;
  name: string;
  p1: [number, number]; // [lat, lon]
  p2: [number, number]; // [lat, lon]
  detourPenaltyKm?: number; // Detour distance to reach nearest bridge / crossing (default: 4.5 km)
}

export interface ScheduledStop {
  orderIndex: number;
  ticketId: string;
  category: string;
  severity: string;
  latitude: number;
  longitude: number;
  priorityScore: number;
  distanceFromPreviousKm: number;
  estimatedTravelTimeMin: number;
  estimatedRepairTimeMin: number;
  cumulativeTimeMin: number;
}

export interface RouteOptimizationResult {
  depot: DepotLocation;
  totalDistanceKm: number;
  totalTravelTimeMin: number;
  totalRepairTimeMin: number;
  totalShiftTimeMin: number;
  stops: ScheduledStop[];
  unservedTickets: MaintenanceTicket[];
  isShiftFeasible: boolean;
}

// Average motorcycle/bicycle transit speed on rural village tracks (km/h)
const RURAL_TRANSIT_SPEED_KMH = 18;

// Tortuosity factor: ratio of actual winding rural road distance to straight-line distance
const RURAL_TORTUOSITY_FACTOR = 1.35;

// Estimated repair duration by infrastructure category (minutes)
const ESTIMATED_REPAIR_TIMES: Record<string, number> = {
  water: 45,
  handpump: 45,
  overhead_tank: 60,
  sanitation: 40,
  public_toilet: 40,
  lighting: 20,
  streetlight: 20,
  road: 60,
  drainage: 50,
  default: 30,
};

// Urgency severity baseline weights
const SEVERITY_WEIGHTS: Record<string, number> = {
  low: 5,
  medium: 12,
  high: 25,
  critical: 45,
};

/**
 * Check if path segment (a -> b) intersects a physical barrier line segment (c -> d)
 */
export function checkSegmentCrossesBarrier(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
  barrier: PhysicalBarrier
): boolean {
  const [cLat, cLon] = barrier.p1;
  const [dLat, dLon] = barrier.p2;

  const ccw = (lat1: number, lon1: number, lat2: number, lon2: number, lat3: number, lon3: number) => {
    return (lon3 - lon1) * (lat2 - lat1) > (lat3 - lat1) * (lon2 - lon1);
  };

  const test1 = ccw(aLat, aLon, cLat, cLon, dLat, dLon) !== ccw(bLat, bLon, cLat, cLon, dLat, dLon);
  const test2 = ccw(aLat, aLon, bLat, bLon, cLat, cLon) !== ccw(aLat, aLon, bLat, bLon, dLat, dLon);

  return test1 && test2;
}

/**
 * Calculate Great-Circle Haversine distance adjusted for rural road tortuosity and canal/river barrier penalties (in km)
 */
export function calculateRuralDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  barriers: PhysicalBarrier[] = []
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  let totalKm = R * c * RURAL_TORTUOSITY_FACTOR;

  // Physical Canal/River Barrier Heuristic: add detour penalty for each crossed barrier
  for (const barrier of barriers) {
    if (checkSegmentCrossesBarrier(lat1, lon1, lat2, lon2, barrier)) {
      totalKm += barrier.detourPenaltyKm ?? 4.5;
    }
  }

  return totalKm;
}

/**
 * Compute multi-factor Priority Score for a ticket
 */
export function computeTicketPriorityScore(ticket: MaintenanceTicket): number {
  const baseWeight = SEVERITY_WEIGHTS[ticket.severity] || 10;
  // Aging penalty: +2 points per day pending (capped at +30)
  const ageBonus = Math.min(ticket.daysPending * 2, 30);
  // Drinking water / primary power lifeline bonus
  const isVitalResource =
    ticket.category === 'water' ||
    ticket.assetType === 'handpump' ||
    ticket.category === 'lighting';
  const lifelineMultiplier = isVitalResource ? 1.25 : 1.0;

  return (baseWeight + ageBonus) * lifelineMultiplier;
}

/**
 * Offline Priority-Weighted TSP Dispatch Solver
 * Executes on-device in < 25ms without server or internet dependency.
 */
export function optimizeMaintenanceRoute(
  depot: DepotLocation,
  tickets: MaintenanceTicket[],
  maxShiftMinutes = 480, // 8-hour workday
  barriers: PhysicalBarrier[] = []
): RouteOptimizationResult {
  if (tickets.length === 0) {
    return {
      depot,
      totalDistanceKm: 0,
      totalTravelTimeMin: 0,
      totalRepairTimeMin: 0,
      totalShiftTimeMin: 0,
      stops: [],
      unservedTickets: [],
      isShiftFeasible: true,
    };
  }

  // Pre-calculate priority scores
  const ticketScores = new Map<string, number>();
  tickets.forEach((t) => ticketScores.set(t.id, computeTicketPriorityScore(t)));

  // Phase 1: Construction Heuristic — Urgency-Biased Nearest Neighbor
  const unvisited = [...tickets];
  const initialTour: MaintenanceTicket[] = [];
  let currentLat = depot.latitude;
  let currentLon = depot.longitude;

  while (unvisited.length > 0) {
    let bestIndex = -1;
    let bestCost = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const candidate = unvisited[i];
      const distKm = calculateRuralDistanceKm(
        currentLat,
        currentLon,
        candidate.latitude,
        candidate.longitude,
        barriers
      );
      const priority = ticketScores.get(candidate.id) || 10;

      // Composite cost: distance minus priority incentive
      // Priority weighting ensures critical tickets are visited early in route
      const compositeCost = distKm * 1.5 - priority * 0.15;

      if (compositeCost < bestCost) {
        bestCost = compositeCost;
        bestIndex = i;
      }
    }

    const nextStop = unvisited.splice(bestIndex, 1)[0];
    initialTour.push(nextStop);
    currentLat = nextStop.latitude;
    currentLon = nextStop.longitude;
  }

  // Phase 2: Improvement Heuristic — Priority-Constrained 2-Opt Local Search
  const tour = [...initialTour];
  let improved = true;
  let iteration = 0;
  const maxIterations = 50;

  while (improved && iteration < maxIterations) {
    improved = false;
    iteration++;

    for (let i = 0; i < tour.length - 1; i++) {
      for (let j = i + 1; j < tour.length; j++) {
        // Evaluate distance change if segment [i...j] is reversed
        const prevA = i === 0 ? depot : tour[i - 1];
        const a = tour[i];
        const b = tour[j];
        const nextB = j === tour.length - 1 ? depot : tour[j + 1];

        const currentDist =
          calculateRuralDistanceKm(prevA.latitude, prevA.longitude, a.latitude, a.longitude, barriers) +
          calculateRuralDistanceKm(b.latitude, b.longitude, nextB.latitude, nextB.longitude, barriers);

        const newDist =
          calculateRuralDistanceKm(prevA.latitude, prevA.longitude, b.latitude, b.longitude, barriers) +
          calculateRuralDistanceKm(a.latitude, a.longitude, nextB.latitude, nextB.longitude, barriers);

        // Priority Constraint: Do not swap if a critical ticket is delayed behind a low ticket
        const scoreA = ticketScores.get(a.id) || 0;
        const scoreB = ticketScores.get(b.id) || 0;
        const violatesPriority = scoreA > 40 && scoreB < 20 && j > i + 2;

        if (newDist < currentDist - 0.05 && !violatesPriority) {
          // Reverse sub-tour between i and j
          let left = i;
          let right = j;
          while (left < right) {
            const temp = tour[left];
            tour[left] = tour[right];
            tour[right] = temp;
            left++;
            right--;
          }
          improved = true;
        }
      }
    }
  }

  // Phase 3: Route Schedule & Time Feasibility Assessment
  const stops: ScheduledStop[] = [];
  const unserved: MaintenanceTicket[] = [];
  let totalDistanceKm = 0;
  let totalTravelTimeMin = 0;
  let totalRepairTimeMin = 0;
  let cumulativeTimeMin = 0;

  let lastLat = depot.latitude;
  let lastLon = depot.longitude;

  for (let idx = 0; idx < tour.length; idx++) {
    const ticket = tour[idx];
    const distKm = calculateRuralDistanceKm(lastLat, lastLon, ticket.latitude, ticket.longitude, barriers);
    const travelTimeMin = Math.round((distKm / RURAL_TRANSIT_SPEED_KMH) * 60);
    const repairTimeMin =
      ESTIMATED_REPAIR_TIMES[ticket.category] ||
      (ticket.assetType && ESTIMATED_REPAIR_TIMES[ticket.assetType]) ||
      ESTIMATED_REPAIR_TIMES.default;

    const returnDistToDepot = calculateRuralDistanceKm(
      ticket.latitude,
      ticket.longitude,
      depot.latitude,
      depot.longitude,
      barriers
    );
    const returnTravelTimeMin = Math.round((returnDistToDepot / RURAL_TRANSIT_SPEED_KMH) * 60);

    const projectedTotalTime =
      cumulativeTimeMin + travelTimeMin + repairTimeMin + returnTravelTimeMin;

    if (projectedTotalTime <= maxShiftMinutes) {
      cumulativeTimeMin += travelTimeMin + repairTimeMin;
      totalDistanceKm += distKm;
      totalTravelTimeMin += travelTimeMin;
      totalRepairTimeMin += repairTimeMin;

      stops.push({
        orderIndex: idx + 1,
        ticketId: ticket.id,
        category: ticket.category,
        severity: ticket.severity,
        latitude: ticket.latitude,
        longitude: ticket.longitude,
        priorityScore: ticketScores.get(ticket.id) || 0,
        distanceFromPreviousKm: Number(distKm.toFixed(2)),
        estimatedTravelTimeMin: travelTimeMin,
        estimatedRepairTimeMin: repairTimeMin,
        cumulativeTimeMin,
      });

      lastLat = ticket.latitude;
      lastLon = ticket.longitude;
    } else {
      unserved.push(ticket);
    }
  }

  // Add final return leg back to Depot
  if (stops.length > 0) {
    const returnLegDist = calculateRuralDistanceKm(
      lastLat,
      lastLon,
      depot.latitude,
      depot.longitude,
      barriers
    );
    const returnLegTime = Math.round((returnLegDist / RURAL_TRANSIT_SPEED_KMH) * 60);
    totalDistanceKm += returnLegDist;
    totalTravelTimeMin += returnLegTime;
    cumulativeTimeMin += returnLegTime;
  }

  return {
    depot,
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
    totalTravelTimeMin,
    totalRepairTimeMin,
    totalShiftTimeMin: cumulativeTimeMin,
    stops,
    unservedTickets: unserved,
    isShiftFeasible: unserved.length === 0,
  };
}

/**
 * Online Backend Route Solver: Builds pgRouting SQL query
 */
export function buildPgRoutingTspQuery(
  wardId: number,
  depotLat: number,
  depotLon: number,
  ticketIds: string[]
): string {
  const idsList = ticketIds.map((id) => `'${id}'`).join(',');

  return `
WITH waypoints AS (
  SELECT 0 AS order_id, 0 AS node_id, ${depotLat}::float8 AS lat, ${depotLon}::float8 AS lng
  UNION ALL
  SELECT ROW_NUMBER() OVER () AS order_id, id AS issue_id,
         ST_Y(location) AS lat, ST_X(location) AS lng
  FROM issues
  WHERE id IN (${idsList}) AND ward_id = ${wardId}
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
  `.trim();
}
