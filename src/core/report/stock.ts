import { dayKey } from "../dates";
import { addDays, bucketIndex, dayToDate, eachDay } from "../period";
import type { DayKey, MainPrincipal, Principal, WmsUnit } from "../types";
import { MAIN_PRINCIPALS, PRINCIPALS } from "../types";
import type { ReportContext } from "./context";

export interface StockSnapshot {
  /** Snapshot taken at the end of this day (23:59:59.999). */
  day: DayKey;
  label: string;
  total: number;
  perPrincipal: Record<Principal, number>;
}

export interface StockBlock {
  /** One snapshot at the end of every bucket of the period. */
  snapshots: StockSnapshot[];
  /** Stock at the end of the day before the period starts. */
  startOfPeriod: StockSnapshot;
  /** Stock at the end of the period. */
  endOfPeriod: StockSnapshot;
  /** Absolute HU change over the period (end − start). Null when the data does not reach back to the start. */
  delta: { total: number; perPrincipal: Record<Principal, number> } | null;
  /** Average stock (HUs at the end of each day), in total and per main principal. */
  average: Record<StockKey, StockAverage>;
}

export type StockKey = MainPrincipal | "Total";

export interface StockAverage {
  /** Mean of the end-of-day stock over all days of the period. */
  avg: number;
  /** Mean per bucket (month, week or day) of the period. */
  perBucket: { key: string; label: string; avg: number }[];
  /** Highest end-of-day stock in the period (first day on ties). */
  peak: { day: DayKey; hus: number } | null;
  /** Stock at the end of the period. */
  end: number;
}

/** In stock at `at` ⇔ inbound ≤ at and (no outbound or outbound > at). */
export function isInStock(u: WmsUnit, at: Date): boolean {
  return u.inslagUnit !== null && u.inslagUnit <= at && (u.uitslagUnit === null || u.uitslagUnit > at);
}

const endOfDay = (k: DayKey) => new Date(dayToDate(k).getTime() + 86_400_000 - 1);

export function snapshot(units: readonly WmsUnit[], day: DayKey, label = day): StockSnapshot {
  const at = endOfDay(day);
  const perPrincipal = Object.fromEntries(PRINCIPALS.map((p) => [p, 0])) as Record<Principal, number>;
  let total = 0;
  for (const u of units) {
    if (!isInStock(u, at)) continue;
    total++;
    perPrincipal[u.principal]++;
  }
  return { day, label, total, perPrincipal };
}

/**
 * Stock uses all units, not only those moved in the period: stock at a moment
 * depends on everything that came in before it.
 * NOTE: the layout of the stock slide (which snapshots, which comparison) is
 * still to be decided; this provides the building blocks.
 */
export function computeStock(ctx: ReportContext): StockBlock {
  const snapshots = ctx.buckets.map((b) => snapshot(ctx.units, b.to, b.label));
  const startDay = addDays(ctx.period.from, -1);
  const startOfPeriod = snapshot(ctx.units, startDay);
  const endOfPeriod = snapshot(ctx.units, ctx.period.to, ctx.period.label);
  const startAt = endOfDay(startDay);
  const hasHistory = ctx.units.some((u) => u.inslagUnit !== null && u.inslagUnit <= startAt);
  return {
    average: averageStock(ctx),
    snapshots,
    startOfPeriod,
    endOfPeriod,
    delta: hasHistory
      ? {
          total: endOfPeriod.total - startOfPeriod.total,
          perPrincipal: Object.fromEntries(
            PRINCIPALS.map((p) => [p, endOfPeriod.perPrincipal[p] - startOfPeriod.perPrincipal[p]]),
          ) as Record<Principal, number>,
        }
      : null,
  };
}

/**
 * End-of-day stock for every day of the period, averaged per bucket. A HU is
 * in stock at the end of day d when it came in on or before d and left after
 * d (or has not left). Done as one sweep over the units.
 */
export function averageStock(ctx: ReportContext): Record<StockKey, StockAverage> {
  const days = eachDay(ctx.period);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const keys: StockKey[] = [...MAIN_PRINCIPALS, "Total"];
  const start = Object.fromEntries(keys.map((k) => [k, 0])) as Record<StockKey, number>;
  const diff = Object.fromEntries(keys.map((k) => [k, days.map(() => 0)])) as Record<StockKey, number[]>;
  const index = new Map(days.map((d, i) => [d, i]));
  const isMain = (p: string): p is MainPrincipal => (MAIN_PRINCIPALS as readonly string[]).includes(p);

  for (const u of ctx.units) {
    if (!u.inslagUnit) continue;
    const inDay = dayKey(u.inslagUnit);
    const outDay = u.uitslagUnit ? dayKey(u.uitslagUnit) : null;
    if (inDay > last || (outDay !== null && outDay <= inDay)) continue;
    if (outDay !== null && outDay < first) continue;
    const ks: StockKey[] = isMain(u.principal) ? ["Total", u.principal] : ["Total"];
    // +1 from the end of the inbound day, -1 from the end of the outbound day.
    for (const k of ks) {
      if (inDay < first) start[k]++;
      else diff[k][index.get(inDay)!]!++;
      if (outDay !== null && outDay <= last) diff[k][index.get(outDay)!]!--;
    }
  }

  return Object.fromEntries(
    keys.map((k) => {
      let level = start[k];
      const series = days.map((_, i) => (level += diff[k][i]!));
      let peak: StockAverage["peak"] = null;
      series.forEach((v, i) => {
        if (!peak || v > peak.hus) peak = { day: days[i]!, hus: v };
      });
      const perBucket = ctx.buckets.map((b) => {
        const xs = series.filter((_, i) => bucketIndex([b], days[i]!) === 0);
        return { key: b.key, label: b.label, avg: xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0 };
      });
      const avg: StockAverage = { avg: series.reduce((a, x) => a + x, 0) / series.length, perBucket, peak, end: series[series.length - 1]! };
      return [k, avg];
    }),
  ) as Record<StockKey, StockAverage>;
}
