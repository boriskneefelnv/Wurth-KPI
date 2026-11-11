import { dayKey } from "../dates";
import type { DayKey } from "../types";
import type { ReportContext } from "./context";

export interface DailyVolumeBlock {
  /** Only days with activity, chronological. */
  perDay: { day: DayKey; inbound: number; outbound: number; total: number }[];
  totals: { inbound: number; outbound: number; total: number };
  /** Average over days with recorded activity. */
  avgPerActiveDay: { inbound: number; outbound: number; total: number } | null;
  /** Average over workdays (Mon–Fri, minus holidays) in the period. */
  avgPerWorkday: { inbound: number; outbound: number; total: number } | null;
  peak: { day: DayKey; total: number } | null;
}

/**
 * Physical HU movements per day: inbound by Losdatum (unloading), outbound by
 * Laaddatum (loading). Deliberately different dates than the workload slides.
 * Only HUs on a ride are counted.
 */
export function computeDailyVolume(ctx: ReportContext): DailyVolumeBlock {
  const days = new Map<DayKey, { inbound: number; outbound: number }>();
  const add = (d: Date, dir: "inbound" | "outbound") => {
    if (!ctx.inPeriod(d)) return;
    const k = dayKey(d);
    let e = days.get(k);
    if (!e) days.set(k, (e = { inbound: 0, outbound: 0 }));
    e[dir]++;
  };
  for (const u of ctx.units) {
    if (u.losdatum && u.inkomendeRit) add(u.losdatum, "inbound");
    if (u.laaddatum && u.uitgaandeRit) add(u.laaddatum, "outbound");
  }

  const perDay = [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, e]) => ({ day, inbound: e.inbound, outbound: e.outbound, total: e.inbound + e.outbound }));
  const totals = perDay.reduce(
    (t, d) => ({ inbound: t.inbound + d.inbound, outbound: t.outbound + d.outbound, total: t.total + d.total }),
    { inbound: 0, outbound: 0, total: 0 },
  );
  const avg = (n: number) =>
    n > 0 ? { inbound: totals.inbound / n, outbound: totals.outbound / n, total: totals.total / n } : null;

  let peak: DailyVolumeBlock["peak"] = null;
  for (const d of perDay) if (!peak || d.total > peak.total) peak = { day: d.day, total: d.total };

  return {
    perDay,
    totals,
    avgPerActiveDay: avg(perDay.length),
    avgPerWorkday: avg(ctx.workdays),
    peak,
  };
}
