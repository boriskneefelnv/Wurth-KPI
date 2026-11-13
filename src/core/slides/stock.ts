import type { ReportPeriod } from "../period";
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

export interface StockSlideModel {
  title: string;
  period: ReportPeriod;
  comparisonLabel: string | null;
  ghostLabel: string | null;
  per: string;
  views: Record<StockKey, StockView>;
  order: StockKey[];
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
      const prev = primary ? primary.report.stock.average[key] : null;
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

  return {
    title: "Stock",
    period,
    comparisonLabel: primary ? `vs ${primary.report.period.label}` : null,
    ghostLabel: primary && aligned ? primary.report.period.label : null,
    per: period.kind === "week" ? "Per day" : period.kind === "month" ? "Per week" : "Per month",
    views,
    order: ORDER,
  };
}
