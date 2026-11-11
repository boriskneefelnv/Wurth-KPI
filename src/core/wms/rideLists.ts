import { dayKey, parseDateValue } from "../dates";
import type { DayKey, Direction } from "../types";
import type { SheetData } from "./excel";
import { normalizeRide, str } from "./enrich";

/**
 * WMS ride lists: "Te laden" (outbound) and "Te lossen" (inbound).
 *
 * Per ride they give the expected loading/unloading date ("Verwachte datum"),
 * which is leading for dating a ride, and the number of units on the ride.
 * A ride can appear on several rows (e.g. an old "In afwachting" row with 0
 * units next to the real one); rows are merged per ride.
 */

export interface PlannedRide {
  direction: Direction;
  ritNummer: string;
  /** Verwachte datum of the row carrying most units (ties: latest date). */
  plannedDate: DayKey | null;
  /** "Tijd" of that row, e.g. "13:00:00". */
  plannedTime: string | null;
  /** Sum over all rows of the ride. */
  units: number;
  shipments: number;
  /** "Status omschrijving" of the leading row (Geladen, Gelost, In transit, …). */
  status: string;
  /** Final state: Geladen (outbound) / Gelost (inbound). */
  completed: boolean;
  referentie: string;
  afdeling: string;
  rowCount: number;
  /** Reference contains "test". */
  isTest: boolean;
  /** Reference contains "cancel". */
  isCancelled: boolean;
}

export interface ParsedRideList {
  direction: Direction;
  sheetName: string;
  rides: PlannedRide[];
  /** Earliest and latest Verwachte datum in the list. */
  dateRange: { from: DayKey; to: DayKey } | null;
  rawRowCount: number;
}

export class RideListParseError extends Error {}

const REQUIRED = ["Ritnummer", "Verwachte datum", "Units", "Status omschrijving"] as const;
const norm = (s: unknown) => str(s).toLowerCase().replace(/\s+/g, " ");

/**
 * Direction from the columns: "Te laden" has loadAllowed, "Te lossen" has
 * "Units verplaatst". Pass `direction` to override.
 */
export function detectRideListDirection(headers: readonly string[]): Direction | null {
  const h = headers.map(norm);
  if (h.includes("loadallowed") || h.includes("loadallowedreason")) return "outbound";
  if (h.includes("units verplaatst")) return "inbound";
  return null;
}

export function parseRideList(sheets: SheetData[], direction?: Direction): ParsedRideList {
  for (const sheet of sheets) {
    const headerIdx = sheet.rows.slice(0, 15).findIndex((r) => REQUIRED.every((c) => r.map(norm).includes(norm(c))));
    if (headerIdx === -1) continue;
    const headers = (sheet.rows[headerIdx] ?? []).map((h) => str(h));
    const dir = direction ?? detectRideListDirection(headers);
    if (!dir) {
      throw new RideListParseError(
        `Kan niet bepalen of "${sheet.name}" een laad- of loslijst is. Kies de richting handmatig.`,
      );
    }
    const col = (name: string) => headers.map(norm).indexOf(norm(name));
    const c = {
      rit: col("Ritnummer"),
      date: col("Verwachte datum"),
      time: col("Tijd"),
      units: col("Units"),
      shipments: col("Zendingen"),
      status: col("Status omschrijving"),
      ref: col("Referentie"),
      afd: col("Afdeling"),
    };

    type Row = { date: DayKey | null; time: string | null; units: number; shipments: number; status: string; ref: string; afd: string };
    const perRide = new Map<string, Row[]>();
    let rawRowCount = 0;
    for (const cells of sheet.rows.slice(headerIdx + 1)) {
      if (!cells || cells.every((v) => v === null || v === undefined || str(v) === "")) continue;
      rawRowCount++;
      const rit = normalizeRide(cells[c.rit]);
      if (!rit) continue;
      const d = parseDateValue(cells[c.date]);
      const row: Row = {
        date: d ? dayKey(d) : null,
        time: c.time >= 0 ? str(cells[c.time]) || null : null,
        units: Number(cells[c.units] ?? 0) || 0,
        shipments: c.shipments >= 0 ? Number(cells[c.shipments] ?? 0) || 0 : 0,
        status: str(cells[c.status]),
        ref: c.ref >= 0 ? str(cells[c.ref]) : "",
        afd: c.afd >= 0 ? str(cells[c.afd]) : "",
      };
      perRide.set(rit, [...(perRide.get(rit) ?? []), row]);
    }

    const rides: PlannedRide[] = [];
    for (const [ritNummer, rows] of perRide) {
      const lead = [...rows].sort((a, b) => b.units - a.units || (b.date ?? "").localeCompare(a.date ?? ""))[0]!;
      const completedStatus = dir === "outbound" ? "geladen" : "gelost";
      rides.push({
        direction: dir,
        ritNummer,
        plannedDate: lead.date,
        plannedTime: lead.time,
        units: rows.reduce((a, r) => a + r.units, 0),
        shipments: rows.reduce((a, r) => a + r.shipments, 0),
        status: lead.status,
        completed: norm(lead.status) === completedStatus,
        referentie: lead.ref,
        afdeling: lead.afd,
        rowCount: rows.length,
        isTest: rows.some((r) => /\btest\b/i.test(r.ref)),
        isCancelled: rows.some((r) => /cancel/i.test(r.ref)),
      });
    }
    const dates = rides.map((r) => r.plannedDate).filter((d): d is DayKey => d !== null).sort();
    return {
      direction: dir,
      sheetName: sheet.name,
      rides,
      dateRange: dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null,
      rawRowCount,
    };
  }
  throw new RideListParseError(`Geen rittenlijst gevonden: verwacht kolommen ${REQUIRED.join(", ")}.`);
}

/** Which planned rides count as real rides for the KPIs. */
export interface RideFilter {
  /** Default true: rides with "test" in the reference are ignored. */
  excludeTest?: boolean;
  /** Default true: rides with "cancel" in the reference are ignored. */
  excludeCancelled?: boolean;
  /** Default true: rides with 0 units are ignored. */
  excludeEmpty?: boolean;
  /** Default true: rides that are not Geladen / Gelost (In afwachting, In transit, …) are ignored. */
  excludeNotCompleted?: boolean;
}

export function isCountedRide(r: PlannedRide, f: RideFilter = {}): boolean {
  if ((f.excludeTest ?? true) && r.isTest) return false;
  if ((f.excludeCancelled ?? true) && r.isCancelled) return false;
  if ((f.excludeEmpty ?? true) && r.units === 0) return false;
  if ((f.excludeNotCompleted ?? true) && !r.completed) return false;
  return r.plannedDate !== null;
}

export type PlannedRideIndex = Record<Direction, Map<string, PlannedRide>>;

export function indexPlannedRides(lists: readonly ParsedRideList[]): PlannedRideIndex {
  const idx: PlannedRideIndex = { inbound: new Map(), outbound: new Map() };
  for (const l of lists) for (const r of l.rides) idx[r.direction].set(r.ritNummer, r);
  return idx;
}

/**
 * Suggested coverage of the ride lists: from the first day of the month of the
 * earliest planned date to the last day of the month of the latest one, over
 * all lists (the overlap of inbound and outbound). The person importing
 * confirms or corrects it, because a list can start on e.g. 2 January simply
 * because nothing moved on 1 January.
 */
export function coverageFromRideLists(lists: readonly ParsedRideList[]): { from: DayKey; to: DayKey } | null {
  const ranges = lists.map((l) => l.dateRange).filter((r): r is { from: DayKey; to: DayKey } => r !== null);
  if (ranges.length === 0) return null;
  const from = ranges.map((r) => r.from).sort().reverse()[0]!; // latest start
  const to = ranges.map((r) => r.to).sort()[0]!; // earliest end
  const [y, m] = to.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${from.slice(0, 7)}-01`, to: `${to.slice(0, 7)}-${String(lastDay).padStart(2, "0")}` };
}
