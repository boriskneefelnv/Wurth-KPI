import type { DayKey } from "../types";

/**
 * Deck formatting, in line with the Neele-Vat business update: English text,
 * Dutch number notation (11.615 and 3,5%). No dashes or special signs in
 * running text: changes are written as "up 12%" / "down 4%".
 */

export const fmtInt = (x: number) => Math.round(x).toLocaleString("nl-NL");

export const fmtDec = (x: number, digits = 1) =>
  x.toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "+12%" / "-4%" for chips (a plain hyphen-minus, no typographic minus). */
export const fmtSignedPct = (x: number) => `${x >= 0 ? "+" : "-"}${Math.abs(Math.round(x))}%`;

/** Changes below this (in %) are called "stable". */
export const STABLE_PCT = 2;

/** "up 12%", "down 4%" or "stable". */
export function changeWords(x: number): string {
  if (Math.abs(x) < STABLE_PCT) return "stable";
  return `${x > 0 ? "up" : "down"} ${Math.abs(Math.round(x))}%`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "17 April". */
export function fmtDay(k: DayKey): string {
  return `${Number(k.slice(8, 10))} ${MONTHS[Number(k.slice(5, 7)) - 1]}`;
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** ISO country code → English name ("AU" → "Australia"); other values unchanged. */
export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n === 1 ? one : many}`;
