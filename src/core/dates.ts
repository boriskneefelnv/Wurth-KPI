import type { DayKey, Period } from "./types";

/**
 * Wall-clock date helpers. See the date convention in ./types.ts.
 */

const EXCEL_EPOCH_OFFSET_DAYS = 25569; // 1970-01-01 as an Excel serial
const MS_PER_DAY = 86_400_000;

export function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY));
}

export function wallClock(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function validWallClock(y: number, m: number, d: number, hh: number, mm: number, ss: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return null;
  const date = wallClock(y, m, d, hh, mm, ss);
  // Reject roll-overs such as 31-02.
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const DAY_FIRST_RE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Parse a cell value into a wall-clock Date.
 *
 * Accepts: empty/null, Date (assumed to already be wall-clock in UTC fields,
 * which is what ExcelJS produces), Excel serial numbers, ISO strings
 * (`2026-04-03`, `2026-04-03 14:00[:00]`) and Dutch day-first strings
 * (`03-04-2026`, `3/4/2026 14:00`). A timezone suffix on ISO strings is
 * ignored on purpose: the WMS has no timezone semantics.
 */
export function parseDateValue(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return excelSerialToDate(value);
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (s === "") return null;

  let m = ISO_RE.exec(s);
  if (m) {
    return validWallClock(+m[1]!, +m[2]!, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }
  m = DAY_FIRST_RE.exec(s);
  if (m) {
    return validWallClock(+m[3]!, +m[2]!, +m[1]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }
  // A numeric string is an Excel serial (some exports store dates as text).
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToDate(Number(s));
  return null;
}

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

export function dayKey(d: Date): DayKey {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function periodOf(d: Date): Period {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function periodOfDayKey(k: DayKey): Period {
  return k.slice(0, 7);
}

export function parsePeriod(p: Period): { year: number; month: number } {
  const [y, m] = p.split("-");
  return { year: Number(y), month: Number(m) };
}

/** Last millisecond of the month (23:59:59.999 on the last day). */
export function periodEnd(p: Period): Date {
  const { year, month } = parsePeriod(p);
  return new Date(Date.UTC(year, month, 1) - 1);
}

export function daysInPeriod(p: Period): number {
  const { year, month } = parsePeriod(p);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function shiftPeriod(p: Period, months: number): Period {
  const { year, month } = parsePeriod(p);
  const d = new Date(Date.UTC(year, month - 1 + months, 1));
  return periodOf(d);
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(d: Date): number {
  const wd = d.getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Number of Monday–Friday days in the given months, minus optional holidays. */
export function workdaysInPeriods(periods: Period[], holidays: ReadonlySet<DayKey> = new Set()): number {
  let n = 0;
  for (const p of periods) {
    const { year, month } = parsePeriod(p);
    const days = daysInPeriod(p);
    for (let day = 1; day <= days; day++) {
      const d = wallClock(year, month, day);
      if (isoWeekday(d) <= 5 && !holidays.has(dayKey(d))) n++;
    }
  }
  return n;
}

const MONTH_ABBR_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-04` → `Apr 26` (deck label, always English). */
export function periodLabelEn(p: Period): string {
  const { year, month } = parsePeriod(p);
  return `${MONTH_ABBR_EN[month - 1]} ${String(year).slice(2)}`;
}

export function sortPeriods(periods: Iterable<Period>): Period[] {
  return [...new Set(periods)].sort();
}
