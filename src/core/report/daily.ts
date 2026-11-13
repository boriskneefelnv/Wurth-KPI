import { eachDay, isWorkday } from "../period";
import type { DayKey, Direction, MainPrincipal } from "../types";
import { MAIN_PRINCIPALS } from "../types";
import { selectedRides, type ReportContext } from "./context";

export type DailyKey = MainPrincipal | "Total";
export const DAILY_KEYS: DailyKey[] = [...MAIN_PRINCIPALS, "Total"];

export interface DailyTotals {
  inbound: number;
  outbound: number;
  total: number;
}

export interface DailySeries {
  /** HUs per day (same order as DailyVolumeBlock.days). */
  inbound: number[];
  outbound: number[];
  /** Rides per day; a ride with several principals counts for each of them, once in the total. */
  inboundRides: number[];
  outboundRides: number[];
  totals: DailyTotals;
  /** Totals / workdays in the period (weekend activity included in the totals). */
  avgPerWorkday: DailyTotals | null;
  /** Busiest day by HUs in and out (first one on ties). */
  peak: ({ day: DayKey } & DailyTotals) | null;
}

export interface DailyVolumeBlock {
  /** Every workday of the period plus weekend days and holidays with activity, chronological. */
  days: { day: DayKey; workday: boolean }[];
  series: Record<DailyKey, DailySeries>;
}

/**
 * HUs handled per day, inbound and outbound, in total and per main principal.
 * Dated exactly like the volume slides (an HU counts on the day of its ride,
 * see ReportContext.unitDay), so the days add up to the volume totals.
 */
export function computeDailyVolume(ctx: ReportContext): DailyVolumeBlock {
  const all = eachDay(ctx.period);
  const index = new Map(all.map((d, i) => [d, i]));
  const zeros = () => all.map(() => 0);
  const raw = Object.fromEntries(
    DAILY_KEYS.map((k) => [k, { inbound: zeros(), outbound: zeros(), inboundRides: zeros(), outboundRides: zeros() }]),
  ) as Record<DailyKey, Record<"inbound" | "outbound" | "inboundRides" | "outboundRides", number[]>>;
  const isMain = (p: string): p is MainPrincipal => (MAIN_PRINCIPALS as readonly string[]).includes(p);

  for (const direction of ["inbound", "outbound"] as Direction[]) {
    for (const u of ctx.units) {
      const day = ctx.unitDay(u, direction);
      const i = day === null ? undefined : index.get(day);
      if (i === undefined) continue;
      raw.Total[direction][i]!++;
      if (isMain(u.principal)) raw[u.principal][direction][i]!++;
    }
    const rideKey = direction === "inbound" ? "inboundRides" : "outboundRides";
    for (const ride of selectedRides(ctx, direction)) {
      const i = index.get(ride.canonicalDate);
      if (i === undefined) continue;
      raw.Total[rideKey][i]!++;
      for (const p of ride.principals) if (isMain(p)) raw[p][rideKey][i]!++;
    }
  }

  // Keep workdays, and other days only when something happened.
  const keep = all.map((d, i) => isWorkday(d, ctx.holidays) || raw.Total.inbound[i]! + raw.Total.outbound[i]! + raw.Total.inboundRides[i]! + raw.Total.outboundRides[i]! > 0);
  const days = all.flatMap((d, i) => (keep[i] ? [{ day: d, workday: isWorkday(d, ctx.holidays) }] : []));
  const pick = (xs: number[]) => xs.filter((_, i) => keep[i]);

  const series = Object.fromEntries(
    DAILY_KEYS.map((k) => {
      const r = raw[k];
      const inbound = pick(r.inbound);
      const outbound = pick(r.outbound);
      const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
      const totals = { inbound: sum(inbound), outbound: sum(outbound), total: sum(inbound) + sum(outbound) };
      let peak: DailySeries["peak"] = null;
      days.forEach(({ day }, i) => {
        const t = inbound[i]! + outbound[i]!;
        if (t > 0 && (!peak || t > peak.total)) peak = { day, inbound: inbound[i]!, outbound: outbound[i]!, total: t };
      });
      const w = ctx.workdays;
      const s: DailySeries = {
        inbound,
        outbound,
        inboundRides: pick(r.inboundRides),
        outboundRides: pick(r.outboundRides),
        totals,
        avgPerWorkday: w > 0 ? { inbound: totals.inbound / w, outbound: totals.outbound / w, total: totals.total / w } : null,
        peak,
      };
      return [k, s];
    }),
  ) as Record<DailyKey, DailySeries>;

  return { days, series };
}
