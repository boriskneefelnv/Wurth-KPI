import { eachDay, isoWeek, MONTHS_EN, type ReportPeriod } from "../period";
import { activeIn, comparableSet } from "./comparable";
import { deltaPct } from "../report/context";
import type { ReportSet } from "../report/report";
import type { StockKey } from "../report/stock";
import type { DayKey, MainPrincipal } from "../types";
import { MAIN_PRINCIPALS } from "../types";

/**
 * View model for the stock slide: average stock (HUs at the end of each day)
 * per month, per principal, with the stock at the end of the period, the
 * highest point and how many workdays of outbound the stock covers.
 */

export interface StockView {
  key: StockKey;
  label: string;
  avg: number;
  /** Change of the average against the main comparison, in %. */
  avgDeltaPct: number | null;
  end: number;
  peak: { day: DayKey; hus: number } | null;
  /** Average stock divided by outbound HUs per workday. */
  workdaysOfStock: number | null;
  buckets: {
    key: string;
    label: string;
    avg: number;
    ghost: number | null;
    /** Only in the all principals view: the average per principal (stacked bars). */
    parts: { principal: MainPrincipal; avg: number }[] | null;
  }[];
}

/** A point of the stock curve: the average over a stretch of days. */
export interface StockPoint {
  key: string;
  label: string;
  /** Average stock per principal over the stretch (the curve is stacked). */
  parts: Record<MainPrincipal, number>;
  total: number;
  /** Same month last year, per view (only for monthly points of aligned periods). */
  ghost: Record<StockKey, number | null>;
}

export interface StockSlideModel {
  title: string;
  period: ReportPeriod;
  comparisonLabel: string | null;
  ghostLabel: string | null;
  per: string;
  views: Record<StockKey, StockView>;
  order: StockKey[];
  /** Curve points: per day (week or month report), per week (quarter) or per month (longer). */
  points: StockPoint[];
  /** "per day", "per week" or "per month", for the chart title. */
  pointUnit: string;
}

const ORDER: StockKey[] = ["Total", "WIAG", "AWKG", "Liqui Moly"];

export function stockSlide(set: ReportSet): StockSlideModel {
  const period = set.current.period;
  const primary = set.comparisons.find((c) => c.kind === "lastYear") ?? set.comparisons.find((c) => c.kind === "previous") ?? null;
  const aligned = period.kind !== "month" && period.kind !== "custom";
  const cur = set.current.stock.average;

  const views = Object.fromEntries(
    ORDER.map((key) => {
      const a = cur[key];
      const prev = primary && activeIn(primary.report, key, set.current) ? primary.report.stock.average[key] : null;
      const outPerWorkday = set.current.dailyVolume.series[key].avgPerWorkday?.outbound ?? 0;
      const view: StockView = {
        key,
        label: key === "Total" ? "All principals" : key,
        avg: a.avg,
        avgDeltaPct: prev && prev.avg > 0 ? deltaPct(a.avg, prev.avg) : null,
        end: a.end,
        peak: a.peak,
        workdaysOfStock: outPerWorkday > 0 ? a.avg / outPerWorkday : null,
        buckets: a.perBucket.map((b, i) => ({
          ...b,
          // No marker for a month without stock last year (e.g. a principal that had not started yet).
          ghost: aligned && prev && (prev.perBucket[i]?.avg ?? 0) > 0 ? prev.perBucket[i]!.avg : null,
          parts: key === "Total" ? MAIN_PRINCIPALS.map((p) => ({ principal: p, avg: cur[p].perBucket[i]!.avg })) : null,
        })),
      };
      return [key, view];
    }),
  ) as Record<StockKey, StockView>;

  // Points: stretches of days, averaged. Monthly averages as asked; shorter
  // reports use weeks or days so the curve still has shape.
  const days = eachDay(period);
  const unit: "day" | "week" | "month" = days.length <= 31 ? "day" : days.length <= 92 ? "week" : "month";
  const groups: { key: string; label: string; idx: number[] }[] = [];
  days.forEach((d, i) => {
    const key = unit === "day" ? d : unit === "week" ? `${isoWeek(d).year}-W${isoWeek(d).week}` : d.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.idx.push(i);
    else groups.push({ key, label: unit === "day" ? `${Number(d.slice(8))} ${MONTHS_EN[Number(d.slice(5, 7)) - 1]}` : unit === "week" ? `Wk ${isoWeek(d).week}` : MONTHS_EN[Number(d.slice(5, 7)) - 1]!, idx: [i] });
  });
  const mean = (xs: number[], idx: number[]) => idx.reduce((a, i) => a + (xs[i] ?? 0), 0) / idx.length;
  const prevAvg = primary && aligned ? primary.report.stock.average : null;
  const prevDays = primary ? eachDay(primary.report.period) : [];
  const points: StockPoint[] = groups.map((g) => {
    const parts = Object.fromEntries(MAIN_PRINCIPALS.map((p) => [p, mean(cur[p].daily, g.idx)])) as Record<MainPrincipal, number>;
    const ghost = Object.fromEntries(ORDER.map((k) => [k, null])) as Record<StockKey, number | null>;
    if (prevAvg && unit === "month") {
      // The same month last year (aligned periods have the same months).
      const m = g.key.slice(5);
      const pi = prevDays.map((d, i) => (d.slice(5, 7) === m ? i : -1)).filter((i) => i >= 0);
      for (const k of ORDER) {
        const v = pi.length && activeIn(primary!.report, k, set.current) ? mean(prevAvg[k].daily, pi) : 0;
        ghost[k] = v > 0 ? v : null;
      }
    }
    return { key: g.key, label: g.label, parts, total: mean(cur.Total.daily, g.idx), ghost };
  });

  return {
    points,
    pointUnit: `per ${unit}`,
    title: "Stock",
    period,
    comparisonLabel: primary ? `vs ${primary.report.period.label}` : null,
    ghostLabel: primary && aligned ? primary.report.period.label : null,
    per: period.kind === "week" ? "Per day" : period.kind === "month" ? "Per week" : "Per month",
    views,
    order: ORDER,
  };
}
