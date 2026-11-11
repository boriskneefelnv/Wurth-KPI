import { dayKey, wallClock } from "./dates";
import type { DayKey } from "./types";

/**
 * Days the Maasvlakte warehouse is closed, derived from the 2025–2026 scan
 * data: no activity on New Year's Day, Easter Monday, King's Day, Ascension
 * Day, Whit Monday, Christmas and Boxing Day, and Liberation Day only in
 * lustrum years (5 May 2025 closed, 5 May 2026 worked). Good Friday is a
 * normal working day.
 */

/** Easter Sunday (Anonymous Gregorian algorithm). */
export function easterSunday(year: number): DayKey {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayKey(wallClock(year, month, day));
}

const shift = (k: DayKey, days: number) => {
  const [y, m, d] = k.split("-").map(Number) as [number, number, number];
  return dayKey(wallClock(y, m, d + days));
};

export function warehouseHolidays(year: number): { day: DayKey; name: string }[] {
  const easter = easterSunday(year);
  const kingsDay = wallClock(year, 4, 27).getUTCDay() === 0 ? `${year}-04-26` : `${year}-04-27`;
  const list = [
    { day: `${year}-01-01`, name: "New Year's Day" },
    { day: shift(easter, 1), name: "Easter Monday" },
    { day: kingsDay, name: "King's Day" },
    { day: shift(easter, 39), name: "Ascension Day" },
    { day: shift(easter, 50), name: "Whit Monday" },
    { day: `${year}-12-25`, name: "Christmas Day" },
    { day: `${year}-12-26`, name: "Boxing Day" },
  ];
  if (year % 5 === 0) list.push({ day: `${year}-05-05`, name: "Liberation Day" });
  return list.sort((a, b) => a.day.localeCompare(b.day));
}

/** Holiday days for all years touched by the range. */
export function warehouseHolidaySet(from: DayKey, to: DayKey): Set<DayKey> {
  const set = new Set<DayKey>();
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of warehouseHolidays(y)) set.add(h.day);
  }
  return set;
}
