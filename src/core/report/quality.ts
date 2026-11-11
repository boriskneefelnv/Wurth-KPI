import { availableComparisons, comparisonPeriod, type ComparisonKind, type Coverage, type ReportPeriod } from "../period";
import type { DayKey, Direction, Ride, WmsUnit } from "../types";
import type { PlannedRideIndex } from "../wms/rideLists";
import { rideOf } from "../wms/rides";
import { reconcileRideLists } from "./reconcile";

/** Maximum relative difference between unit file HUs and ride list units. */
export const MAX_UNIT_DEVIATION = 0.02;

export interface PeriodQuality {
  period: ReportPeriod;
  /** Unit file HUs / ride list units per direction (null without list units). */
  inbound: number | null;
  outbound: number | null;
  /** Both directions within ±2%. */
  ok: boolean;
}

export function periodQuality(
  units: readonly WmsUnit[],
  planned: PlannedRideIndex,
  rides: readonly Ride[],
  period: ReportPeriod,
): PeriodQuality {
  const r = reconcileRideLists(units, planned, rides, period);
  const within = (x: number | null) => x === null || Math.abs(1 - x) <= MAX_UNIT_DEVIATION;
  return {
    period,
    inbound: r.inbound.completeness,
    outbound: r.outbound.completeness,
    ok: within(r.inbound.completeness) && within(r.outbound.completeness),
  };
}

export interface ComparisonOption {
  kind: ComparisonKind;
  period: ReportPeriod;
  /** Covered by the ride lists. */
  covered: boolean;
  quality: PeriodQuality | null;
  usable: boolean;
  /** Dutch explanation when not usable. */
  reason: string | null;
}

/**
 * All comparisons for a period with whether they can be used: the period must
 * be covered by the ride lists and the unit file must match the lists (±2%).
 */
export function comparisonOptionsWithQuality(
  period: ReportPeriod,
  coverage: Coverage | null,
  quality: (p: ReportPeriod) => PeriodQuality,
): ComparisonOption[] {
  if (period.kind === "custom") return [];
  const covered = new Set(availableComparisons(period, coverage));
  const kinds: ComparisonKind[] = period.kind === "week" || period.kind === "year" ? ["previous"] : ["previous", "lastYear"];
  return kinds.map((kind) => {
    const p = comparisonPeriod(period, kind);
    if (!covered.has(kind)) {
      return { kind, period: p, covered: false, quality: null, usable: false, reason: `Geen ritdata voor ${p.label}` };
    }
    const q = quality(p);
    return {
      kind,
      period: p,
      covered: true,
      quality: q,
      usable: q.ok,
      reason: q.ok ? null : `Unitoverzicht sluit voor ${p.label} niet aan op de rittenlijsten`,
    };
  });
}

// ---------------------------------------------------------------------------
// Ride issues: everything that differs between the ride lists and the unit file
// ---------------------------------------------------------------------------

export type RideIssueKind =
  | "missing-in-unit-file"
  | "not-on-ride-list"
  | "unit-count-differs"
  | "ignored-not-completed"
  | "ignored-test"
  | "ignored-cancelled";

export interface RideIssue {
  direction: Direction;
  ritNummer: string;
  kind: RideIssueKind;
  plannedDate: DayKey | null;
  scanDate: DayKey | null;
  status: string | null;
  referentie: string | null;
  listUnits: number | null;
  unitFileHus: number;
  opdrachtgevers: string[];
  dossiers: string[];
}

/** Rides in the period (by planned date, or scan date when not on a list) that need a closer look. */
export function rideIssues(
  units: readonly WmsUnit[],
  planned: PlannedRideIndex,
  rides: readonly Ride[],
  period: ReportPeriod,
): RideIssue[] {
  const issues: RideIssue[] = [];
  const inP = (d: DayKey | null) => d !== null && d >= period.from && d <= period.to;
  for (const direction of ["outbound", "inbound"] as const) {
    const byRide = new Map<string, WmsUnit[]>();
    for (const u of units) {
      const rit = rideOf(u, direction);
      if (rit) byRide.set(rit, [...(byRide.get(rit) ?? []), u]);
    }
    const rideMap = new Map(rides.filter((r) => r.direction === direction).map((r) => [r.ritNummer, r]));
    const base = (ritNummer: string) => {
      const us = byRide.get(ritNummer) ?? [];
      return {
        direction,
        ritNummer,
        unitFileHus: us.length,
        opdrachtgevers: [...new Set(us.map((u) => u.opdrachtgever))],
        dossiers: [...new Set(us.map((u) => u.dossiernummer))].slice(0, 10),
        scanDate: rideMap.get(ritNummer)?.scanDate ?? null,
      };
    };
    for (const p of planned[direction].values()) {
      if (!inP(p.plannedDate)) continue;
      const b = base(p.ritNummer);
      const common = { ...b, plannedDate: p.plannedDate, status: p.status, referentie: p.referentie, listUnits: p.units };
      let kind: RideIssueKind | null = null;
      if (p.isTest) kind = "ignored-test";
      else if (p.isCancelled) kind = p.units > 0 || b.unitFileHus > 0 ? "ignored-cancelled" : null;
      else if (p.units === 0) kind = null; // empty placeholder rows
      else if (!p.completed) kind = "ignored-not-completed";
      else if (b.unitFileHus === 0) kind = "missing-in-unit-file";
      else if (b.unitFileHus !== p.units) kind = "unit-count-differs";
      if (kind) issues.push({ ...common, kind });
    }
    for (const r of rideMap.values()) {
      if (r.listStatus !== "not-on-list" || !inP(r.scanDate)) continue;
      issues.push({ ...base(r.ritNummer), kind: "not-on-ride-list", plannedDate: null, status: null, referentie: null, listUnits: null });
    }
  }
  return issues;
}
