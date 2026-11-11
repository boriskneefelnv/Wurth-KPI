import { principalSortKey, RIDE_DATE_THRESHOLD } from "../constants";
import { dayKey, periodOfDayKey } from "../dates";
import type { DayKey, Direction, Principal, Ride, RideDate, Shipment, WmsUnit } from "../types";
import { isCountedRide, type PlannedRide, type PlannedRideIndex, type RideFilter } from "./rideLists";

/**
 * Canonical day of a ride (or shipment) from the dates of its HUs.
 *
 * Valid dates are grouped per calendar day and walked from the newest day
 * backwards. The canonical day is the first day at which the cumulative share
 * of dated HUs reaches 5%. This ignores a thin "tail" of HUs scanned later
 * (e.g. 2 of 100 HUs on the next day) without picking an old outlier.
 *
 * Returns null when no HU has a valid date.
 */
export function resolveRideDate(dates: readonly (Date | null | undefined)[]): RideDate | null {
  const perDay = new Map<DayKey, number>();
  let total = 0;
  for (const d of dates) {
    if (!d || Number.isNaN(d.getTime())) continue;
    const k = dayKey(d);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
    total++;
  }
  if (total === 0) return null;

  const days = [...perDay.keys()].sort().reverse(); // newest first
  let cumulative = 0;
  let canonical = days[days.length - 1]!;
  let skippedNewer = 0;
  for (const day of days) {
    const cnt = perDay.get(day)!;
    cumulative += cnt;
    if (cumulative / total >= RIDE_DATE_THRESHOLD) {
      canonical = day;
      skippedNewer = cumulative - cnt;
      break;
    }
  }
  const onCanonical = perDay.get(canonical)!;
  return {
    canonicalDate: canonical,
    period: periodOfDayKey(canonical),
    resolution: days.length === 1 ? "single" : "majority_5pct",
    outlierHuCount: total - onCanonical,
    skippedNewerHuCount: skippedNewer,
  };
}

export const rideOf = (u: WmsUnit, direction: Direction) =>
  direction === "inbound" ? u.inkomendeRit : u.uitgaandeRit;
export const directionalDate = (u: WmsUnit, direction: Direction) =>
  direction === "inbound" ? u.inslagUnit : u.uitslagUnit;

function mostCommon<T>(values: Iterable<T>): T | null {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

export interface MaterializeResult {
  rides: Ride[];
  shipments: Shipment[];
  /** Rides without any dated HU and without a planned date; they cannot be placed in a period. */
  undatedRides: { direction: Direction; ritNummer: string; huCount: number }[];
  /** Counted rides from the ride lists that have no HUs in the unit file. */
  listOnlyRides: PlannedRide[];
}

export interface MaterializeOptions {
  /** Ride lists (Te laden / Te lossen). Their Verwachte datum is leading. */
  planned?: PlannedRideIndex;
  rideFilter?: RideFilter;
}

/**
 * Build rides and shipments for both directions from the full unit set.
 * Units without a ride number for a direction do not belong to a ride there.
 */
export function materializeRides(units: readonly WmsUnit[], options: MaterializeOptions = {}): MaterializeResult {
  const rides: Ride[] = [];
  const shipments: Shipment[] = [];
  const undatedRides: MaterializeResult["undatedRides"] = [];
  const listOnlyRides: PlannedRide[] = [];

  for (const direction of ["inbound", "outbound"] as const) {
    const byRide = new Map<string, WmsUnit[]>();
    for (const u of units) {
      const rit = rideOf(u, direction);
      if (!rit) continue;
      let list = byRide.get(rit);
      if (!list) byRide.set(rit, (list = []));
      list.push(u);
    }

    const plannedIdx = options.planned?.[direction];
    if (plannedIdx) {
      for (const p of plannedIdx.values()) {
        if (!byRide.has(p.ritNummer) && isCountedRide(p, options.rideFilter)) listOnlyRides.push(p);
      }
    }

    const rideByNumber = new Map<string, Ride>();
    for (const [ritNummer, list] of byRide) {
      const scans = resolveRideDate(list.map((u) => directionalDate(u, direction)));
      const plan = plannedIdx?.get(ritNummer);
      const usePlan = plan && isCountedRide(plan, options.rideFilter) ? plan : null;
      if (!scans && !usePlan) {
        undatedRides.push({ direction, ritNummer, huCount: list.length });
        continue;
      }
      const canonical = usePlan?.plannedDate ?? scans!.canonicalDate;
      const date = {
        canonicalDate: canonical,
        period: periodOfDayKey(canonical),
        resolution: usePlan ? ("planned" as const) : scans!.resolution,
        outlierHuCount: scans ? scans.outlierHuCount : 0,
      };
      const huByPrincipal: Partial<Record<Principal, number>> = {};
      for (const u of list) huByPrincipal[u.principal] = (huByPrincipal[u.principal] ?? 0) + 1;
      const ride: Ride = {
        direction,
        ritNummer,
        canonicalDate: date.canonicalDate,
        scanDate: scans?.canonicalDate ?? date.canonicalDate,
        plannedUnits: plan ? plan.units : null,
        period: date.period,
        dateResolution: date.resolution,
        outlierHuCount: date.outlierHuCount,
        huCount: list.length,
        shipmentCount: new Set(list.map((u) => u.dossiernummer).filter(Boolean)).size,
        principals: (Object.keys(huByPrincipal) as Principal[]).sort(
          (a, b) => principalSortKey(a) - principalSortKey(b),
        ),
        huByPrincipal,
      };
      rides.push(ride);
      rideByNumber.set(ritNummer, ride);
    }

    // Shipments: one per (direction, dossiernummer); ride = the ride holding most of its HUs.
    const byDossier = new Map<string, WmsUnit[]>();
    for (const u of units) {
      if (!u.dossiernummer || !rideOf(u, direction)) continue;
      let list = byDossier.get(u.dossiernummer);
      if (!list) byDossier.set(u.dossiernummer, (list = []));
      list.push(u);
    }
    for (const [dossiernummer, list] of byDossier) {
      const ritNummer = mostCommon(list.map((u) => rideOf(u, direction)!))!;
      const ride = rideByNumber.get(ritNummer);
      if (!ride) continue; // undated ride
      const own = resolveRideDate(list.map((u) => directionalDate(u, direction)));
      shipments.push({
        direction,
        dossiernummer,
        referentie: list.find((u) => u.referentie)?.referentie ?? null,
        ritNummer,
        period: ride.period,
        ownDate: own?.canonicalDate ?? null,
        huCount: list.length,
        principal: mostCommon(list.map((u) => u.principal)),
      });
    }
  }

  return { rides, shipments, undatedRides, listOnlyRides };
}

/** Lookup of canonical ride info per direction, for KPI code. */
export type RideIndex = Record<Direction, Map<string, Ride>>;

export function indexRides(rides: readonly Ride[]): RideIndex {
  const idx: RideIndex = { inbound: new Map(), outbound: new Map() };
  for (const r of rides) idx[r.direction].set(r.ritNummer, r);
  return idx;
}
