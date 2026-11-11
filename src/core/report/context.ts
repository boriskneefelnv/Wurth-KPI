import { dayKey } from "../dates";
import { bucketsFor, inRange, workdaysInRange, type ReportPeriod, type TrendBucket } from "../period";
import { indexRides, materializeRides, rideOf, type RideIndex } from "../wms/rides";
import type { DayKey, Direction, Principal, Ride, WmsUnit } from "../types";

export interface ReportOptions {
  /** Days that do not count as workdays (YYYY-MM-DD). Default: none. */
  holidays?: Iterable<DayKey>;
  /**
   * On-time loading rule. `earliest` (Lovable behaviour): earliest outbound
   * scan vs planned departure. `latest`: every HU must be out by the planned day.
   */
  onTimeRule?: "earliest" | "latest";
}

/** Everything the KPI functions need for one period, computed once. */
export interface ReportContext {
  units: readonly WmsUnit[];
  period: ReportPeriod;
  buckets: TrendBucket[];
  workdays: number;
  rides: RideIndex;
  unitsByRide: Record<Direction, Map<string, WmsUnit[]>>;
  holidays: ReadonlySet<DayKey>;
  options: Required<Omit<ReportOptions, "holidays">>;
  /** True when the (wall-clock) date falls inside the report period. */
  inPeriod(d: Date | null): boolean;
}

export function buildContext(
  units: readonly WmsUnit[],
  period: ReportPeriod,
  options: ReportOptions = {},
  rides?: readonly Ride[],
): ReportContext {
  const unitsByRide: ReportContext["unitsByRide"] = { inbound: new Map(), outbound: new Map() };
  for (const direction of ["inbound", "outbound"] as const) {
    for (const u of units) {
      const rit = rideOf(u, direction);
      if (!rit) continue;
      let list = unitsByRide[direction].get(rit);
      if (!list) unitsByRide[direction].set(rit, (list = []));
      list.push(u);
    }
  }
  const holidays = new Set(options.holidays ?? []);
  return {
    units,
    period,
    buckets: bucketsFor(period),
    workdays: workdaysInRange(period, holidays),
    rides: indexRides(rides ?? materializeRides(units).rides),
    unitsByRide,
    holidays,
    options: { onTimeRule: options.onTimeRule ?? "earliest" },
    inPeriod: (d) => d !== null && inRange(dayKey(d), period),
  };
}

/** Rides of a direction whose canonical day falls in the report period. */
export function selectedRides(ctx: ReportContext, direction: Direction): Ride[] {
  return [...ctx.rides[direction].values()].filter((r) => inRange(r.canonicalDate, ctx.period));
}

export function dominantPrincipal(ride: Ride): Principal {
  let best: Principal = ride.principals[0] ?? "Overig";
  let n = -1;
  for (const p of ride.principals) {
    const c = ride.huByPrincipal[p] ?? 0;
    if (c > n) {
      best = p;
      n = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Percentage (0–100) or null when there is nothing to measure. */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

/** Relative change in % or null when the baseline is 0. */
export function deltaPct(current: number, baseline: number): number | null {
  return baseline > 0 ? ((current - baseline) / baseline) * 100 : null;
}

export function inc<K>(m: Map<K, number>, k: K, by = 1) {
  m.set(k, (m.get(k) ?? 0) + by);
}

export type { TrendBucket };
