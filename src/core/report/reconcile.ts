import { dayKey } from "../dates";
import { bucketsFor, inRange, type ReportPeriod } from "../period";
import type { DayKey, Direction, Principal, Ride, WmsUnit } from "../types";
import { isCountedRide, type PlannedRide, type PlannedRideIndex, type RideFilter } from "../wms/rideLists";
import { PRINCIPALS } from "../types";
import type { RejectedRow, RejectReason } from "../wms/enrich";
import { directionalDate, rideOf } from "../wms/rides";

/**
 * Volume reconciliation: explains, per direction, how the number of rows in
 * the WMS file with a date in the period becomes the number on the slide.
 * Meant to compare one-to-one with a count in the WMS or in Excel.
 */
export interface DirectionReconciliation {
  /** Rows in the file (accepted + rejected) with an Inslag/Uitslag Unit in the period. */
  rowsInFile: number;
  rejected: Partial<Record<RejectReason, number>>;
  /** = HUs on the slide (Total). */
  counted: number;
  perPrincipal: Record<Principal, number>;
  /** Clients not mapped to WIAG/AWKG/Liqui Moly; they are in the total but on no principal slide. */
  overigClients: Record<string, number>;
  /** Counted HUs without a ride number: in the HU figures, not in the ride figures. */
  husWithoutRide: number;
  /** = rides on the slide: distinct rides whose canonical day is in the period. */
  rides: number;
  /** Distinct ride numbers among the counted HUs (how Lovable counted). */
  rideNumbersOnHus: number;
  /** Ride numbers with HUs in the period but a canonical day outside it (counted in the other period). */
  ridesCountedElsewhere: string[];
}

export type VolumeReconciliation = Record<Direction, DirectionReconciliation>;

export function reconcileVolume(
  units: readonly WmsUnit[],
  rejected: readonly RejectedRow[],
  rides: readonly Ride[],
  period: ReportPeriod,
): VolumeReconciliation {
  const inP = (d: Date | null) => d !== null && inRange(dayKey(d), period);

  const forDirection = (direction: Direction): DirectionReconciliation => {
    const rej: Partial<Record<RejectReason, number>> = {};
    let rejectedCount = 0;
    for (const r of rejected) {
      if (!inP(direction === "inbound" ? r.inslagUnit : r.uitslagUnit)) continue;
      rej[r.reason] = (rej[r.reason] ?? 0) + 1;
      rejectedCount++;
    }

    const perPrincipal = Object.fromEntries(PRINCIPALS.map((p) => [p, 0])) as Record<Principal, number>;
    const overigClients: Record<string, number> = {};
    const rideNumbers = new Set<string>();
    let counted = 0;
    let husWithoutRide = 0;
    for (const u of units) {
      if (!inP(directionalDate(u, direction))) continue;
      counted++;
      perPrincipal[u.principal]++;
      if (u.principal === "Overig") {
        const k = u.opdrachtgever || "(leeg)";
        overigClients[k] = (overigClients[k] ?? 0) + 1;
      }
      const rit = rideOf(u, direction);
      if (rit) rideNumbers.add(rit);
      else husWithoutRide++;
    }

    const dirRides = rides.filter((r) => r.direction === direction);
    const canonicalIn = new Set(dirRides.filter((r) => inRange(r.canonicalDate, period)).map((r) => r.ritNummer));
    return {
      rowsInFile: counted + rejectedCount,
      rejected: rej,
      counted,
      perPrincipal,
      overigClients,
      husWithoutRide,
      rides: canonicalIn.size,
      rideNumbersOnHus: rideNumbers.size,
      ridesCountedElsewhere: [...rideNumbers].filter((r) => !canonicalIn.has(r)).sort(),
    };
  };

  return { inbound: forDirection("inbound"), outbound: forDirection("outbound") };
}

// ---------------------------------------------------------------------------
// Ride lists vs unit file
// ---------------------------------------------------------------------------

export interface RideListBucket {
  key: string;
  label: string;
  /** Units on counted list rides with a planned date in this bucket. */
  listUnits: number;
  /** HUs in the unit file on those rides. */
  unitFileHus: number;
  /** unitFileHus / listUnits (0–1), null without list units. */
  completeness: number | null;
}

export interface RideListReconciliation {
  /** Counted list rides (not test/cancel/empty) with a planned date in the period. */
  listRides: number;
  listUnits: number;
  /** List rides in the period that are ignored, with their units. */
  ignored: { test: { rides: number; units: number }; cancelled: { rides: number; units: number }; empty: number };
  /** Counted rides whose status is not final (not Geladen / Gelost). */
  notCompleted: { rides: number; units: number; statuses: Record<string, number> };
  /** Counted list rides that have HUs in the unit file. */
  matchedRides: number;
  matchedListUnits: number;
  matchedUnitFileHus: number;
  /** Counted list rides without any HU in the unit file (principal and details unknown). */
  missingInUnitFile: { rides: number; units: number; examples: { ritNummer: string; plannedDate: DayKey; units: number }[] };
  /** Rides in the unit file, dated in the period by their scans, that are not on the list. */
  notOnList: { rides: number; hus: number };
  /** HUs in the unit file / units on the list for the period (0–1). */
  completeness: number | null;
  /** Matched rides: planned date vs scan date (5% rule). */
  dateAgreement: { sameDay: number; withinOneDay: number; otherMonth: number };
  perBucket: RideListBucket[];
}

export function reconcileRideLists(
  units: readonly WmsUnit[],
  planned: PlannedRideIndex,
  rides: readonly Ride[],
  period: ReportPeriod,
  filter: RideFilter = {},
): Record<Direction, RideListReconciliation> {
  const buckets = bucketsFor(period);
  const forDirection = (direction: Direction): RideListReconciliation => {
    const hus = new Map<string, number>();
    for (const u of units) {
      const rit = rideOf(u, direction);
      if (rit && directionalDate(u, direction)) hus.set(rit, (hus.get(rit) ?? 0) + 1);
    }
    const inP = [...planned[direction].values()].filter((r) => r.plannedDate && inRange(r.plannedDate, period));
    const counted = inP.filter((r) => isCountedRide(r, filter));
    const test = inP.filter((r) => r.isTest);
    const cancelled = inP.filter((r) => r.isCancelled && !r.isTest);
    const notCompleted = counted.filter((r) => !r.completed);
    const matched = counted.filter((r) => hus.has(r.ritNummer));
    const missing = counted.filter((r) => !hus.has(r.ritNummer));
    const rideMap = new Map(rides.filter((r) => r.direction === direction).map((r) => [r.ritNummer, r]));
    const notOnList = rides.filter(
      (r) => r.direction === direction && !planned[direction].has(r.ritNummer) && inRange(r.canonicalDate, period),
    );
    const sum = (xs: PlannedRide[]) => xs.reduce((a, r) => a + r.units, 0);
    const listUnits = sum(counted);
    const matchedHus = matched.reduce((a, r) => a + (hus.get(r.ritNummer) ?? 0), 0);

    const agreement = { sameDay: 0, withinOneDay: 0, otherMonth: 0 };
    for (const r of matched) {
      const ride = rideMap.get(r.ritNummer);
      if (!ride || !r.plannedDate) continue;
      const diff = Math.abs(Date.parse(ride.scanDate) - Date.parse(r.plannedDate)) / 86_400_000;
      if (diff === 0) agreement.sameDay++;
      else if (diff <= 1) agreement.withinOneDay++;
      if (ride.scanDate.slice(0, 7) !== r.plannedDate.slice(0, 7)) agreement.otherMonth++;
    }

    const statuses: Record<string, number> = {};
    for (const r of notCompleted) statuses[r.status || "(leeg)"] = (statuses[r.status || "(leeg)"] ?? 0) + 1;

    return {
      listRides: counted.length,
      listUnits,
      ignored: {
        test: { rides: test.length, units: sum(test) },
        cancelled: { rides: cancelled.length, units: sum(cancelled) },
        empty: inP.filter((r) => r.units === 0 && !r.isTest && !r.isCancelled).length,
      },
      notCompleted: { rides: notCompleted.length, units: sum(notCompleted), statuses },
      matchedRides: matched.length,
      matchedListUnits: sum(matched),
      matchedUnitFileHus: matchedHus,
      missingInUnitFile: {
        rides: missing.length,
        units: sum(missing),
        examples: missing
          .sort((a, b) => b.units - a.units)
          .slice(0, 10)
          .map((r) => ({ ritNummer: r.ritNummer, plannedDate: r.plannedDate!, units: r.units })),
      },
      notOnList: { rides: notOnList.length, hus: notOnList.reduce((a, r) => a + r.huCount, 0) },
      completeness: listUnits > 0 ? matchedHus / listUnits : null,
      dateAgreement: agreement,
      perBucket: buckets.map((b) => {
        const inB = counted.filter((r) => inRange(r.plannedDate!, b));
        const lu = sum(inB);
        const uh = inB.reduce((a, r) => a + (hus.get(r.ritNummer) ?? 0), 0);
        return { key: b.key, label: b.label, listUnits: lu, unitFileHus: uh, completeness: lu > 0 ? uh / lu : null };
      }),
    };
  };
  return { inbound: forDirection("inbound"), outbound: forDirection("outbound") };
}
