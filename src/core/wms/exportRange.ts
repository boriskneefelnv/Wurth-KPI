import { dayKey } from "../dates";
import type { DayKey, WmsUnit } from "../types";
import type { ParsedRideList } from "./rideLists";

/**
 * Which Laaddatum range the unit overview has to be exported for, given the
 * ride lists. Laaddatum is the pick-up date at the supplier, not the date the
 * pallet passes the warehouse. Measured on 2025–2026 data (128.000 pallets):
 *
 *   before the ride: outbound 98,75% within 2 months, 99,97% within 4 months,
 *                    all within 6 months; inbound 99,98% within 2 months;
 *   after the ride:  0,15% (outbound) and 0,33% (inbound) more than a week
 *                    after the ride date, practically none more than a month.
 *
 * Hence: from 4 months before the first ride month up to 1 month after the
 * last ride date.
 */
export const LEAD_MONTHS = 4;
export const TRAIL_MONTHS = 1;

export interface UnitExportRange {
  /** Ride dates in the lists. */
  rides: { from: DayKey; to: DayKey };
  /** Laaddatum range to export (end capped at today). */
  from: DayKey;
  to: DayKey;
}

const addMonths = (k: DayKey, n: number, firstOfMonth = false): DayKey => {
  const [y, m, d] = k.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1 + n, firstOfMonth ? 1 : d));
  // Clip day overflow (e.g. 31 Jan + 1 month → 28 Feb).
  if (!firstOfMonth && date.getUTCDate() !== d) date.setUTCDate(0);
  return dayKey(date);
};

export function unitExportRange(lists: readonly ParsedRideList[], today: DayKey): UnitExportRange | null {
  const ranges = lists.map((l) => l.dateRange).filter((r): r is { from: DayKey; to: DayKey } => r !== null);
  if (!ranges.length) return null;
  const ridesFrom = ranges.map((r) => r.from).sort()[0]!;
  const ridesTo = ranges.map((r) => r.to).sort().reverse()[0]!;
  const to = addMonths(ridesTo, TRAIL_MONTHS);
  return {
    rides: { from: ridesFrom, to: ridesTo },
    from: addMonths(ridesFrom, -LEAD_MONTHS, true),
    to: to > today ? today : to,
  };
}

export interface UnitExportCheck {
  /** Laaddatum range present in the loaded unit overviews. */
  loaded: { from: DayKey; to: DayKey } | null;
  /** Laaddatum ranges still missing at the start and the end (null when covered). */
  missingStart: { from: DayKey; to: DayKey } | null;
  missingEnd: { from: DayKey; to: DayKey } | null;
  ok: boolean;
}

/** Does the loaded unit data cover the advised Laaddatum range? Allows a week of slack (first and last pick-ups need not fall on the boundary). */
export function checkUnitExport(units: readonly WmsUnit[], advice: UnitExportRange): UnitExportCheck {
  let from: DayKey | null = null;
  let to: DayKey | null = null;
  for (const u of units) {
    if (!u.laaddatum) continue;
    const k = dayKey(u.laaddatum);
    if (from === null || k < from) from = k;
    if (to === null || k > to) to = k;
  }
  if (!from || !to) return { loaded: null, missingStart: { from: advice.from, to: advice.to }, missingEnd: null, ok: false };
  const slack = (k: DayKey, days: number) => dayKey(new Date(Date.parse(k) + days * 86_400_000));
  const missingStart = from > slack(advice.from, 7) ? { from: advice.from, to: slack(from, -1) } : null;
  const missingEnd = to < slack(advice.to, -7) ? { from: slack(to, 1), to: advice.to } : null;
  return { loaded: { from, to }, missingStart, missingEnd, ok: !missingStart && !missingEnd };
}

/** Last day on which any pallet was scanned in or out: periods after it have not happened yet. */
export function lastScanDay(units: readonly WmsUnit[]): DayKey | null {
  let last: DayKey | null = null;
  for (const u of units) {
    for (const d of [u.inslagUnit, u.uitslagUnit]) {
      if (!d) continue;
      const k = dayKey(d);
      if (last === null || k > last) last = k;
    }
  }
  return last;
}
