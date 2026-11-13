import { dayKey, isoWeekday, parsePeriod, wallClock } from "./dates";
import type { DayKey } from "./types";

/**
 * Report periods and comparisons.
 *
 * A report covers one period of a given kind and can be compared with the
 * previous period and/or the same period one year earlier. Only periods that
 * are fully covered by the imported data can be chosen (see Coverage).
 */

/** `ytd`: year to date, 1 January up to and including the month in the key. */
export type ReportKind = "week" | "month" | "quarter" | "half" | "year" | "ytd";
export const REPORT_KINDS: readonly ReportKind[] = ["week", "month", "quarter", "half", "year", "ytd"];

export type ComparisonKind = "previous" | "lastYear";

/** Inclusive day range. */
export interface DateRange {
  from: DayKey;
  to: DayKey;
}

export interface ReportPeriod extends DateRange {
  kind: ReportKind | "custom";
  /** `2026-W14`, `2026-04`, `2026-Q2`, `2026-H1`, `2026`, or `from..to` for custom. */
  key: string;
  /** English deck label: `Week 14 2026`, `Apr 2026`, `Q2 2026`, `H1 2026`, `2026`. */
  label: string;
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ---------------------------------------------------------------------------
// Day arithmetic
// ---------------------------------------------------------------------------

export function dayToDate(k: DayKey): Date {
  const [y, m, d] = k.split("-").map(Number) as [number, number, number];
  return wallClock(y, m, d);
}

export function addDays(k: DayKey, n: number): DayKey {
  const d = dayToDate(k);
  d.setUTCDate(d.getUTCDate() + n);
  return dayKey(d);
}

export function eachDay(range: DateRange): DayKey[] {
  const out: DayKey[] = [];
  for (let k = range.from; k <= range.to; k = addDays(k, 1)) out.push(k);
  return out;
}

export function isWorkday(k: DayKey, holidays: ReadonlySet<DayKey> = new Set()): boolean {
  return isoWeekday(dayToDate(k)) <= 5 && !holidays.has(k);
}

export function workdaysInRange(range: DateRange, holidays: ReadonlySet<DayKey> = new Set()): number {
  return eachDay(range).filter((k) => isWorkday(k, holidays)).length;
}

export function inRange(k: DayKey, range: DateRange): boolean {
  return k >= range.from && k <= range.to;
}

const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------
// ISO weeks
// ---------------------------------------------------------------------------

/** ISO year and week number of a day. */
export function isoWeek(k: DayKey): { year: number; week: number } {
  const d = dayToDate(k);
  // Thursday of this week decides the ISO year.
  d.setUTCDate(d.getUTCDate() + 4 - isoWeekday(d));
  const year = d.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((d.getTime() - jan1) / 86_400_000 / 7) + 1;
  return { year, week };
}

function isoWeekMonday(year: number, week: number): DayKey {
  const jan4 = wallClock(year, 1, 4);
  const monday = addDays(dayKey(jan4), 1 - isoWeekday(jan4));
  return addDays(monday, (week - 1) * 7);
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

/** Build a period from its key, e.g. makePeriod("quarter", "2026-Q2"). */
export function makePeriod(kind: ReportKind, key: string): ReportPeriod {
  switch (kind) {
    case "week": {
      const m = /^(\d{4})-W(\d{1,2})$/.exec(key);
      if (!m) throw new Error(`Ongeldige week: ${key}`);
      const [year, week] = [Number(m[1]), Number(m[2])];
      const from = isoWeekMonday(year, week);
      return { kind, key: `${year}-W${pad(week)}`, label: `Week ${week} ${year}`, from, to: addDays(from, 6) };
    }
    case "month": {
      const { year, month } = parsePeriod(key);
      return {
        kind,
        key: `${year}-${pad(month)}`,
        label: `${MONTHS_EN[month - 1]} ${year}`,
        from: `${year}-${pad(month)}-01`,
        to: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
      };
    }
    case "quarter": {
      const m = /^(\d{4})-Q([1-4])$/.exec(key);
      if (!m) throw new Error(`Ongeldig kwartaal: ${key}`);
      const [year, q] = [Number(m[1]), Number(m[2])];
      const lastMonth = q * 3;
      return {
        kind,
        key,
        label: `Q${q} ${year}`,
        from: `${year}-${pad(lastMonth - 2)}-01`,
        to: `${year}-${pad(lastMonth)}-${pad(lastDayOfMonth(year, lastMonth))}`,
      };
    }
    case "half": {
      const m = /^(\d{4})-H([12])$/.exec(key);
      if (!m) throw new Error(`Ongeldig halfjaar: ${key}`);
      const [year, h] = [Number(m[1]), Number(m[2])];
      return {
        kind,
        key,
        label: `H${h} ${year}`,
        from: h === 1 ? `${year}-01-01` : `${year}-07-01`,
        to: h === 1 ? `${year}-06-30` : `${year}-12-31`,
      };
    }
    case "year": {
      if (!/^\d{4}$/.test(key)) throw new Error(`Ongeldig jaar: ${key}`);
      return { kind, key, label: key, from: `${key}-01-01`, to: `${key}-12-31` };
    }
    case "ytd": {
      const { year, month } = parsePeriod(key);
      return {
        kind,
        key: `${year}-${pad(month)}`,
        label: month === 1 ? `Jan ${year}` : `Jan to ${MONTHS_EN[month - 1]} ${year}`,
        from: `${year}-01-01`,
        to: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
      };
    }
  }
}

/** Free day range (not offered in the UI; used for tests and ad-hoc analyses). */
export function customPeriod(from: DayKey, to: DayKey): ReportPeriod {
  return { kind: "custom", key: `${from}..${to}`, label: `${from} – ${to}`, from, to };
}

/** The period of a kind that contains the given day. */
export function periodContaining(kind: ReportKind, k: DayKey): ReportPeriod {
  const y = Number(k.slice(0, 4));
  const m = Number(k.slice(5, 7));
  switch (kind) {
    case "week": {
      const { year, week } = isoWeek(k);
      return makePeriod("week", `${year}-W${pad(week)}`);
    }
    case "month":
      return makePeriod("month", k.slice(0, 7));
    case "quarter":
      return makePeriod("quarter", `${y}-Q${Math.ceil(m / 3)}`);
    case "half":
      return makePeriod("half", `${y}-H${m <= 6 ? 1 : 2}`);
    case "year":
      return makePeriod("year", String(y));
    case "ytd":
      return makePeriod("ytd", k.slice(0, 7));
  }
}

/**
 * The comparison period. `previous` = the period directly before;
 * `lastYear` = the same period one year earlier (for weeks: same ISO week number).
 */
export function comparisonPeriod(p: ReportPeriod, comparison: ComparisonKind): ReportPeriod {
  if (p.kind === "custom") throw new Error("Vrije periodes hebben geen vergelijking");
  if (comparison === "previous" && p.kind === "ytd") throw new Error("Year to date vergelijkt alleen met vorig jaar");
  if (comparison === "previous") return periodContaining(p.kind, addDays(p.from, -1));
  if (p.kind === "week") {
    const { year, week } = isoWeek(p.from);
    const target = Math.min(week, isoWeek(`${year - 1}-12-28`).week); // week 53 → last week of previous year
    return makePeriod("week", `${year - 1}-W${pad(target)}`);
  }
  const y = Number(p.from.slice(0, 4));
  if (p.kind === "ytd") return makePeriod("ytd", `${y - 1}${p.key.slice(4)}`);
  return periodContaining(p.kind, `${y - 1}${p.from.slice(4)}`);
}

/** Comparisons that make sense per report kind (year: previous year = same period last year). */
export function comparisonOptions(kind: ReportKind): ComparisonKind[] {
  if (kind === "ytd") return ["lastYear"]; // the same months last year; "previous" has no meaning here
  return kind === "week" || kind === "year" ? ["previous"] : ["previous", "lastYear"];
}

/** Default selection: month compares with previous month; quarter/half with both. */
export function defaultComparisons(kind: ReportKind): ComparisonKind[] {
  if (kind === "ytd") return ["lastYear"];
  return kind === "quarter" || kind === "half" ? ["previous", "lastYear"] : ["previous"];
}

export function comparisonLabel(p: ReportPeriod, comparison: ComparisonKind): string {
  return `vs ${comparisonPeriod(p, comparison).label}`;
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

export interface TrendBucket extends DateRange {
  key: string;
  label: string;
}

/**
 * Bars within a period: week → days, month → ISO weeks (clipped to the month),
 * quarter/half/year → months. Custom: days (≤ 7 days), weeks (within one
 * month) or months.
 */
export function bucketsFor(p: ReportPeriod): TrendBucket[] {
  const unit =
    p.kind === "week" ? "day" : p.kind === "month" ? "week" : p.kind === "custom" ? customUnit(p) : "month";
  const buckets: TrendBucket[] = [];
  for (const k of eachDay(p)) {
    const last = buckets[buckets.length - 1];
    const startsNew =
      !last ||
      unit === "day" ||
      (unit === "week" && isoWeekday(dayToDate(k)) === 1) ||
      (unit === "month" && k.endsWith("-01"));
    if (startsNew) {
      buckets.push({ key: bucketKey(unit, k), label: bucketLabel(unit, k), from: k, to: k });
    } else {
      last.to = k;
    }
  }
  return buckets;
}

function customUnit(p: DateRange): "day" | "week" | "month" {
  if (eachDay(p).length <= 7) return "day";
  return p.from.slice(0, 7) === p.to.slice(0, 7) ? "week" : "month";
}

function bucketKey(unit: "day" | "week" | "month", k: DayKey): string {
  if (unit === "day") return k;
  if (unit === "month") return k.slice(0, 7);
  const { year, week } = isoWeek(k);
  return `${year}-W${pad(week)}`;
}

function bucketLabel(unit: "day" | "week" | "month", k: DayKey): string {
  if (unit === "day") return `${WEEKDAYS_EN[isoWeekday(dayToDate(k)) - 1]} ${k.slice(8)}-${k.slice(5, 7)}`;
  if (unit === "month") return MONTHS_EN[Number(k.slice(5, 7)) - 1]!;
  return `Wk ${isoWeek(k).week}`;
}

export function bucketIndex(buckets: readonly TrendBucket[], k: DayKey): number {
  for (let i = 0; i < buckets.length; i++) if (inRange(k, buckets[i]!)) return i;
  return -1;
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

/**
 * The day range for which the import is assumed complete.
 *
 * Detected from the data: from the first to the last day with an outbound
 * scan (inbound scans can be years old for goods still in stock, so they only
 * extend the end). Can be overridden with an explicit range from the import.
 */
export type Coverage = DateRange;

export function detectCoverage(units: readonly { inslagUnit: Date | null; uitslagUnit: Date | null }[]): Coverage | null {
  let from: DayKey | null = null;
  let to: DayKey | null = null;
  for (const u of units) {
    if (u.uitslagUnit) {
      const k = dayKey(u.uitslagUnit);
      if (from === null || k < from) from = k;
      if (to === null || k > to) to = k;
    }
  }
  if (from === null || to === null) return null;
  for (const u of units) {
    if (u.inslagUnit) {
      const k = dayKey(u.inslagUnit);
      if (k > to) to = k;
    }
  }
  return { from, to };
}

/**
 * A period counts as covered when the data spans its first and last workday
 * (a period may start or end in a weekend without outbound activity).
 */
export function isCovered(p: DateRange, coverage: Coverage | null): boolean {
  if (!coverage) return false;
  const workdays = eachDay(p).filter((k) => isWorkday(k));
  const first = workdays[0] ?? p.from;
  const last = workdays[workdays.length - 1] ?? p.to;
  return coverage.from <= first && coverage.to >= last;
}

/** All fully covered periods of a kind, newest first. */
export function availablePeriods(kind: ReportKind, coverage: Coverage | null): ReportPeriod[] {
  if (!coverage) return [];
  const out: ReportPeriod[] = [];
  if (kind === "ytd") {
    // Every month end since 1 January that the data covers, from February on
    // (January alone is the month report).
    for (let m = periodContaining("month", coverage.to); m.to >= coverage.from; m = periodContaining("month", addDays(m.from, -1))) {
      if (m.key.endsWith("-01")) continue;
      const p = makePeriod("ytd", m.key);
      if (isCovered(p, coverage)) out.push(p);
    }
    return out;
  }
  let p = periodContaining(kind, coverage.to);
  while (p.to >= coverage.from) {
    if (isCovered(p, coverage)) out.push(p);
    p = periodContaining(kind, addDays(p.from, -1));
  }
  return out;
}

/** Comparisons for this period that the data can support. */
export function availableComparisons(p: ReportPeriod, coverage: Coverage | null): ComparisonKind[] {
  if (p.kind === "custom") return [];
  return comparisonOptions(p.kind).filter((c) => isCovered(comparisonPeriod(p, c), coverage));
}

export { MONTHS_EN };
