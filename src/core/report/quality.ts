import { availableComparisons, comparisonPeriod, type ComparisonKind, type Coverage, type ReportPeriod } from "../period";
import type { DayKey, Direction, Ride, WmsUnit } from "../types";
import type { PlannedRideIndex } from "../wms/rideLists";
import { directionalDate, rideOf } from "../wms/rides";
import { reconcileRideLists } from "./reconcile";
import { LEAD_MONTHS } from "../wms/exportRange";

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
  /** Finished on the list, but no scanned pallet in the unit file: not counted. */
  | "missing-in-unit-file"
  /** Pallets scanned on a ride that is not on the ride lists: not counted. */
  | "not-on-ride-list"
  /** Not on the ride lists, but scanned within a week of their first/last date: most likely planned just outside the exported period. */
  | "outside-ride-list-period"
  /** Counted; the number of scanned pallets differs from the list. Slide uses the scans. */
  | "unit-count-differs"
  /** Counted because pallets were scanned, although the list status is open or the reference says cancel. */
  | "counted-open-status"
  /** Open status and nothing scanned yet: not counted. */
  | "not-handled"
  /** Reference contains "test": not counted. */
  | "ignored-test";

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
    // Scanned pallets per ride.
    const byRide = new Map<string, WmsUnit[]>();
    for (const u of units) {
      const rit = rideOf(u, direction);
      if (rit && directionalDate(u, direction)) byRide.set(rit, [...(byRide.get(rit) ?? []), u]);
    }
    const counted = new Set(rides.filter((r) => r.direction === direction && r.listStatus === "counted").map((r) => r.ritNummer));
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
      if (p.isTest) kind = p.units > 0 || b.unitFileHus > 0 ? "ignored-test" : null;
      else if (counted.has(p.ritNummer)) {
        if (!p.completed || p.isCancelled) kind = "counted-open-status";
        else if (b.unitFileHus !== p.units) kind = "unit-count-differs";
      } else if (p.units === 0 || (p.isCancelled && b.unitFileHus === 0)) kind = null; // placeholders and cancelled rides
      else if (!p.completed) kind = "not-handled";
      else kind = "missing-in-unit-file";
      if (kind) issues.push({ ...common, kind });
    }
    const listDates = [...planned[direction].values()].map((p) => p.plannedDate).filter((d): d is DayKey => d !== null).sort();
    const listFrom = listDates[0];
    const listTo = listDates[listDates.length - 1];
    const nearEdge = (d: DayKey) =>
      !!listFrom && !!listTo && (Math.abs(Date.parse(d) - Date.parse(listTo)) <= 7 * 86_400_000 || Math.abs(Date.parse(d) - Date.parse(listFrom)) <= 7 * 86_400_000);
    for (const r of rideMap.values()) {
      if (r.listStatus !== "not-on-list" || !inP(r.scanDate)) continue;
      issues.push({
        ...base(r.ritNummer),
        kind: nearEdge(r.scanDate) ? "outside-ride-list-period" : "not-on-ride-list",
        plannedDate: null,
        status: null,
        referentie: null,
        listUnits: null,
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Export advice
// ---------------------------------------------------------------------------

/**
 * Pallets are picked up at the supplier (Laaddatum) weeks before they pass the
 * warehouse: in 2026 the median was 16 days before the outbound ride, 99.9%
 * within 113 days. An unit export filtered on Laaddatum therefore has to start
 * well before the first month that is reported.
 */
export const LAADDATUM_LEAD_MONTHS = LEAD_MONTHS;

export interface ExportAdvice {
  /** Earliest Laaddatum in the unit export. */
  firstLaaddatum: DayKey;
  /** First month that does not match. */
  month: string;
  /** Laaddatum the unit export should start at to cover that month. */
  exportFrom: DayKey;
}

/**
 * When a month does not match the ride lists and the unit export starts too
 * late for it, explain that and give the Laaddatum to export from.
 */
export function unitExportAdvice(units: readonly WmsUnit[], failingMonths: readonly string[]): ExportAdvice | null {
  let first: DayKey | null = null;
  for (const u of units) {
    if (!u.laaddatum) continue;
    const k = dayKeyOf(u.laaddatum);
    if (first === null || k < first) first = k;
  }
  if (!first || failingMonths.length === 0) return null;
  const month = [...failingMonths].sort()[0]!;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const from = new Date(Date.UTC(y, m - 1 - LAADDATUM_LEAD_MONTHS, 1)).toISOString().slice(0, 10);
  return first > from ? { firstLaaddatum: first, month, exportFrom: from } : null;
}

const dayKeyOf = (d: Date) => d.toISOString().slice(0, 10);
