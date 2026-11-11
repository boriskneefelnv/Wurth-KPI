import { dayKey } from "../dates";
import { warehouseHolidaySet } from "../holidays";
import { addDays, bucketsFor, inRange, workdaysInRange, type ReportPeriod, type TrendBucket } from "../period";
import { directionalDate, indexRides, materializeRides, rideOf, type RideIndex } from "../wms/rides";
import type { DayKey, Direction, Principal, Ride, WmsUnit } from "../types";

export interface ReportOptions {
  /**
   * Days that do not count as workdays (YYYY-MM-DD). Default: the warehouse
   * holiday calendar (see holidays.ts). Pass [] for Monday–Friday only.
   */
  holidays?: Iterable<DayKey>;
  /**
   * On-time loading rule. `latest` (default): the whole ride (last pallet) is
   * out by the planned day. `earliest` (Lovable behaviour): loading started by then.
   */
  onTimeRule?: "earliest" | "latest";
  /**
   * Which day an HU counts on. `ride` (default): the day of its ride (Verwachte
   * datum from the ride list, else the 5% rule), so HUs and rides always fall
   * in the same period; HUs without a ride use their own scan. `scan`: the
   * HU's own Inslag Unit / Uitslag Unit.
   */
  huDating?: "ride" | "scan";
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
  /** Day an HU counts on for a direction (see ReportOptions.huDating); null when it has no movement. */
  unitDay(u: WmsUnit, direction: Direction): DayKey | null;
  /** True when the HU's inbound/outbound movement counts in the report period. */
  unitInPeriod(u: WmsUnit, direction: Direction): boolean;
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
  const holidays = new Set(options.holidays ?? warehouseHolidaySet(addDays(period.from, -400), period.to));
  const allRides = rides ?? materializeRides(units).rides;
  // With ride lists, only rides counted on the lists (and their HUs) take part.
  const listsUsed = allRides.some((r) => r.listStatus !== "no-list");
  const rideIndex = indexRides(allRides.filter(isCountable));
  const huDating = options.huDating ?? "ride";
  const unitDay = (u: WmsUnit, direction: Direction): DayKey | null => {
    const scan = directionalDate(u, direction);
    const rit = rideOf(u, direction);
    const ride = rit ? rideIndex[direction].get(rit) : undefined;
    if (listsUsed) {
      // An HU counts when it was scanned and its ride is counted, on the ride's date.
      if (!ride || !scan) return null;
      return huDating === "ride" ? ride.canonicalDate : dayKey(scan);
    }
    if (!scan) return null;
    if (huDating === "ride" && ride) return ride.canonicalDate;
    return dayKey(scan);
  };
  return {
    units,
    period,
    buckets: bucketsFor(period),
    workdays: workdaysInRange(period, holidays),
    rides: rideIndex,
    unitsByRide,
    holidays,
    options: { onTimeRule: options.onTimeRule ?? "latest", huDating },
    inPeriod: (d) => d !== null && inRange(dayKey(d), period),
    unitDay,
    unitInPeriod: (u, direction) => {
      const k = unitDay(u, direction);
      return k !== null && inRange(k, period);
    },
  };
}

/** Rides that take part in the KPIs (see Ride.listStatus). */
export function isCountable(r: Ride): boolean {
  return r.listStatus === "counted" || r.listStatus === "no-list";
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
