import { dayKey, parsePeriod, sortPeriods, wallClock, isoWeekday, daysInPeriod } from "../dates";
import { indexRides, materializeRides, rideOf, type RideIndex } from "../wms/rides";
import type { DayKey, Direction, Period, Principal, Ride, WmsUnit } from "../types";

export interface ReportOptions {
  /** Days that do not count as workdays (YYYY-MM-DD). Default: none. */
  holidays?: Iterable<DayKey>;
  /**
   * On-time loading rule. `earliest` (Lovable behaviour): earliest outbound
   * scan vs planned departure. `latest`: every HU must be out by the planned day.
   */
  onTimeRule?: "earliest" | "latest";
}

/** Everything the KPI functions need, computed once. */
export interface ReportContext {
  units: readonly WmsUnit[];
  selected: Period[];
  selectedSet: ReadonlySet<Period>;
  rides: RideIndex;
  unitsByRide: Record<Direction, Map<string, WmsUnit[]>>;
  holidays: ReadonlySet<DayKey>;
  options: Required<Omit<ReportOptions, "holidays">>;
}

export function buildContext(
  units: readonly WmsUnit[],
  selectedPeriods: Iterable<Period>,
  options: ReportOptions = {},
  rides?: readonly Ride[],
): ReportContext {
  const selected = sortPeriods(selectedPeriods);
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
  return {
    units,
    selected,
    selectedSet: new Set(selected),
    rides: indexRides(rides ?? materializeRides(units).rides),
    unitsByRide,
    holidays: new Set(options.holidays ?? []),
    options: { onTimeRule: options.onTimeRule ?? "earliest" },
  };
}

/** Rides of a direction whose canonical period is selected. */
export function selectedRides(ctx: ReportContext, direction: Direction): Ride[] {
  return [...ctx.rides[direction].values()].filter((r) => ctx.selectedSet.has(r.period));
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

export function inc<K>(m: Map<K, number>, k: K, by = 1) {
  m.set(k, (m.get(k) ?? 0) + by);
}

// ---------------------------------------------------------------------------
// Trend buckets
// ---------------------------------------------------------------------------

export interface TrendBucket {
  key: string;
  label: string;
  /** Inclusive first day. */
  from: DayKey;
  /** Inclusive last day. */
  to: DayKey;
}

/**
 * One selected month → Monday-based weeks clipped to the month ("Week 1", …).
 * Several months → one bucket per month.
 */
export function trendBuckets(selected: readonly Period[]): TrendBucket[] {
  if (selected.length === 1) {
    const p = selected[0]!;
    const { year, month } = parsePeriod(p);
    const buckets: TrendBucket[] = [];
    const days = daysInPeriod(p);
    for (let day = 1; day <= days; day++) {
      const d = wallClock(year, month, day);
      if (day === 1 || isoWeekday(d) === 1) {
        buckets.push({ key: `${p}-W${buckets.length + 1}`, label: `Week ${buckets.length + 1}`, from: dayKey(d), to: dayKey(d) });
      } else {
        buckets[buckets.length - 1]!.to = dayKey(d);
      }
    }
    return buckets;
  }
  return selected.map((p) => ({ key: p, label: p, from: `${p}-01`, to: `${p}-${String(daysInPeriod(p)).padStart(2, "0")}` }));
}

/** Index of the bucket containing the day, or -1. */
export function bucketIndex(buckets: readonly TrendBucket[], day: DayKey): number {
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i]!;
    if (day >= b.from && day <= b.to) return i;
  }
  return -1;
}
