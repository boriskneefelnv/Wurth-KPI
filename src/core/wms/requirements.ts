import { dayKey } from "../dates";
import type { DayKey, Period } from "../types";
import { LEAD_MONTHS, TRAIL_MONTHS } from "./exportRange";

/**
 * What has to be exported from the WMS for the period someone wants to show,
 * and which part is still missing once files are loaded.
 */

export interface DisplayRange {
  /** First month to show (YYYY-MM). */
  from: Period;
  /** Last month to show (YYYY-MM). */
  to: Period;
  /** Also compare with the period of the same length right before it. */
  previous: boolean;
  /** Also compare with the same months one year earlier. */
  lastYear: boolean;
}

export interface DateSpan {
  from: DayKey;
  to: DayKey;
}

export interface ExportRequirements {
  /** The months that will be shown. */
  display: DateSpan;
  /** Te laden / Te lossen: Verwachte datum (shown months plus comparison months, not after today). */
  rides: DateSpan;
  /** Unit overview: Laaddatum (rides range with the lead and trail margin, not after today). */
  units: DateSpan;
}

const monthStart = (p: Period, shift = 0): DayKey => {
  const [y, m] = p.split("-").map(Number) as [number, number];
  return dayKey(new Date(Date.UTC(y, m - 1 + shift, 1)));
};
const monthEnd = (p: Period, shift = 0): DayKey => {
  const [y, m] = p.split("-").map(Number) as [number, number];
  return dayKey(new Date(Date.UTC(y, m + shift, 0)));
};
const monthsBetween = (from: Period, to: Period) => {
  const [y1, m1] = from.split("-").map(Number) as [number, number];
  const [y2, m2] = to.split("-").map(Number) as [number, number];
  return (y2 - y1) * 12 + (m2 - m1) + 1;
};
const min = (a: DayKey, b: DayKey) => (a < b ? a : b);

export function exportRequirements(r: DisplayRange, today: DayKey): ExportRequirements {
  const length = monthsBetween(r.from, r.to);
  const starts = [monthStart(r.from)];
  if (r.previous) starts.push(monthStart(r.from, -length));
  if (r.lastYear) starts.push(monthStart(r.from, -12));
  const dataFrom = starts.sort()[0]!;
  const ridesTo = min(monthEnd(r.to), today);
  const [y, m, d] = ridesTo.split("-").map(Number) as [number, number, number];
  const unitsTo = min(dayKey(new Date(Date.UTC(y, m - 1 + TRAIL_MONTHS, d))), today);
  const [fy, fm] = dataFrom.split("-").map(Number) as [number, number];
  return {
    display: { from: monthStart(r.from), to: monthEnd(r.to) },
    rides: { from: dataFrom, to: ridesTo },
    units: { from: dayKey(new Date(Date.UTC(fy, fm - 1 - LEAD_MONTHS, 1))), to: unitsTo },
  };
}

/** Date span of one loaded file. */
export interface FileSpan extends DateSpan {
  /** The export hit the WMS limit: the last day is probably incomplete. */
  capped: boolean;
}

/**
 * Span of the dates in a file, ignoring stray dates far from the rest: a
 * cut-off export can still hold a single row weeks later. A date at either end
 * counts as stray when it lies more than two weeks from its neighbour and at
 * most 0,5% of the rows are dropped that way. For a capped export the last
 * 0,1% of the rows is ignored as well (the cut is abrupt).
 */
export function fileSpan(dates: readonly DayKey[], capped: boolean): FileSpan | null {
  if (!dates.length) return null;
  const s = [...dates].sort();
  const maxDrop = Math.floor(s.length * 0.005);
  const far = (a: DayKey, b: DayKey) => Math.abs(Date.parse(a) - Date.parse(b)) > 14 * 86_400_000;
  let lo = 0;
  let hi = s.length - 1;
  // Drop isolated groups of dates from the top, then from the bottom.
  for (let i = hi; i > 0 && s.length - 1 - (i - 1) <= maxDrop; i--) {
    if (far(s[i]!, s[i - 1]!)) hi = i - 1;
  }
  for (let i = lo; i < hi && i + 1 <= maxDrop; i++) {
    if (far(s[i]!, s[i + 1]!)) lo = i + 1;
  }
  // A cut-off export ends abruptly; the last 0,1% of its rows are strays.
  if (capped && s.length > 1000) hi = Math.min(hi, s.length - 1 - Math.floor(s.length * 0.001));
  return { from: s[lo]!, to: s[hi]!, capped };
}

const addDays = (k: DayKey, n: number) => dayKey(new Date(Date.parse(k) + n * 86_400_000));

/**
 * Parts of `required` not covered by the files. A capped file only covers up
 * to the day before its last day (that day is cut off halfway), so the missing
 * part starts at its last day. Gaps of up to a week at the edges and up to two
 * weeks between files (weekends, Christmas, quiet days) are not reported.
 */
export function missingSpans(required: DateSpan, files: readonly FileSpan[], slackDays = 7, innerSlackDays = 14): DateSpan[] {
  const covered = files
    .map((f) => ({ from: f.from, to: f.capped ? addDays(f.to, -1) : f.to, capped: f.capped }))
    .filter((c) => c.from <= c.to)
    .sort((a, b) => a.from.localeCompare(b.from));
  const missing: DateSpan[] = [];
  let cursor = required.from; // first day not yet covered
  let cursorExact = false; // true when the previous coverage ended at a cut-off
  for (const c of covered) {
    if (c.to < cursor) continue;
    const gapEnd = addDays(c.from, -1);
    if (gapEnd >= cursor) {
      const gapDays = (Date.parse(gapEnd) - Date.parse(cursor)) / 86_400_000 + 1;
      const atStart = cursor === required.from;
      if (cursorExact || gapDays > (atStart ? slackDays : innerSlackDays)) {
        missing.push({ from: cursor, to: gapEnd < required.to ? gapEnd : required.to });
      }
    }
    if (addDays(c.to, 1) > cursor) {
      cursor = addDays(c.to, 1);
      cursorExact = c.capped;
    }
    if (cursor > required.to) break;
  }
  if (cursor <= required.to) {
    const tailDays = (Date.parse(required.to) - Date.parse(cursor)) / 86_400_000 + 1;
    if (cursorExact || tailDays > slackDays) missing.push({ from: cursor, to: required.to });
  }
  return missing.filter((m) => m.from <= m.to);
}
