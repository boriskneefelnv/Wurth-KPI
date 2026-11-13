import type { ReportPeriod } from "../period";
import { deltaPct } from "../report/context";
import { DAILY_KEYS, type DailyKey, type DailyTotals } from "../report/daily";
import type { ReportSet } from "../report/report";
import type { DayKey } from "../types";
import { MAIN_PRINCIPALS } from "../types";
import { changeWords, fmtDay, fmtInt } from "./format";

/**
 * View model for the daily workload slide: HUs in and out per day, with a
 * view per principal that the presenter switches between on the slide.
 * Deck texts are English.
 */

export interface DailyView {
  key: DailyKey;
  label: string;
  inbound: number[];
  outbound: number[];
  inboundRides: number[];
  outboundRides: number[];
  avgPerWorkday: DailyTotals | null;
  /** Change of the average per workday (in + out) against the main comparison, in %. */
  avgDeltaPct: number | null;
  peak: { day: DayKey; label: string; total: number; inbound: number; outbound: number } | null;
  /** Busiest day as a multiple of the average workday. */
  peakRatio: number | null;
  headline: string;
}

export interface DailySlideModel {
  title: string;
  period: ReportPeriod;
  days: { day: DayKey; label: string; short: string; workday: boolean; monthStart: boolean; month: string }[];
  /** Label of the main comparison, e.g. "vs H1 2025". */
  comparisonLabel: string | null;
  views: Record<DailyKey, DailyView>;
  order: DailyKey[];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekday = (k: DayKey) => WEEKDAYS[new Date(`${k}T00:00:00Z`).getUTCDay()]!;

/** "Tuesday 3 March" */
export const longDay = (k: DayKey) => `${weekday(k)} ${fmtDay(k)}`;

export function dailySlide(set: ReportSet): DailySlideModel {
  const cur = set.current.dailyVolume;
  const primary = set.comparisons.find((c) => c.kind === "lastYear") ?? set.comparisons.find((c) => c.kind === "previous") ?? null;
  const comparisonLabel = primary ? `vs ${primary.report.period.label}` : null;

  let prevMonth = "";
  const days = cur.days.map(({ day, workday }) => {
    const month = day.slice(0, 7);
    const monthStart = month !== prevMonth;
    prevMonth = month;
    return { day, label: longDay(day), short: `${weekday(day).slice(0, 3)} ${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`, workday, monthStart, month: MONTHS[Number(day.slice(5, 7)) - 1]! };
  });

  const views = Object.fromEntries(
    DAILY_KEYS.map((key) => {
      const s = cur.series[key];
      const prev = primary ? primary.report.dailyVolume.series[key].avgPerWorkday : null;
      const avgDeltaPct = s.avgPerWorkday && prev && prev.total > 0 ? deltaPct(s.avgPerWorkday.total, prev.total) : null;
      const peak = s.peak ? { ...s.peak, label: longDay(s.peak.day) } : null;
      const peakRatio = peak && s.avgPerWorkday && s.avgPerWorkday.total > 0 ? peak.total / s.avgPerWorkday.total : null;
      const parts: string[] = [];
      if (s.avgPerWorkday && s.totals.total > 0) {
        const change = avgDeltaPct !== null && primary ? `, ${changeWords(avgDeltaPct)} on ${primary.report.period.label}` : "";
        parts.push(`${fmtInt(s.avgPerWorkday.total)} HUs handled per workday on average${change}.`);
      } else {
        parts.push("No HUs handled in this period.");
      }
      if (key === "Total" && primary && avgDeltaPct !== null) {
        // Growth from a principal that had no volume yet in the comparison period.
        const fresh = MAIN_PRINCIPALS.filter((p) => cur.series[p].totals.total > 0 && primary.report.dailyVolume.series[p].totals.total === 0);
        if (fresh.length) parts.push(`${fresh.join(" and ")} ${fresh.length === 1 ? "was" : "were"} not yet active in ${primary.report.period.label}.`);
      }
      if (peak) parts.push(`Busiest day was ${peak.label} with ${fmtInt(peak.total)} HUs.`);
      const view: DailyView = {
        key,
        label: key === "Total" ? "All principals" : key,
        inbound: s.inbound,
        outbound: s.outbound,
        inboundRides: s.inboundRides,
        outboundRides: s.outboundRides,
        avgPerWorkday: s.avgPerWorkday,
        avgDeltaPct,
        peak,
        peakRatio,
        headline: parts.join(" "),
      };
      return [key, view];
    }),
  ) as Record<DailyKey, DailyView>;

  return { title: "Daily workload", period: set.current.period, days, comparisonLabel, views, order: ["Total", "WIAG", "AWKG", "Liqui Moly"] };
}
