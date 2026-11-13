import type { ReportPeriod } from "../period";
import { activeIn, comparableSet } from "./comparable";
import type { DailyKey } from "../report/daily";
import type { ReportSet } from "../report/report";
import type { StorageStats } from "../report/storage";
import type { StorageBucket } from "../types";
import { MAIN_PRINCIPALS, STORAGE_BUCKETS } from "../types";
import { fmtDec, fmtInt } from "./format";

/**
 * View model for the storage duration slide: how long HUs stayed in the
 * warehouse before they left in the period (average, median and the spread
 * over duration groups), per principal. Deck texts are English.
 */

export type StorageKey = DailyKey;

export const STORAGE_GROUP_LABEL: Record<StorageBucket, string> = {
  "0-7": "Up to 7 days",
  "8-14": "8 to 14 days",
  "15-30": "15 to 30 days",
  "31-60": "31 to 60 days",
  ">60": "Over 60 days",
};

export interface StorageView {
  key: StorageKey;
  label: string;
  count: number;
  avgDays: number | null;
  medianDays: number | null;
  /** Change in days against the main comparison. */
  avgDelta: number | null;
  medianDelta: number | null;
  groups: { bucket: StorageBucket; label: string; count: number; share: number | null; ghostShare: number | null }[];
  perPeriod: { key: string; label: string; count: number; avgDays: number | null; medianDays: number | null; ghostAvg: number | null }[];
  headline: string;
}

export interface StorageSlideModel {
  title: string;
  period: ReportPeriod;
  comparisonLabel: string | null;
  /** Comparison period name for the legend, e.g. "H1 2025". */
  ghostLabel: string | null;
  /** "Per month", "Per week" or "Per day". */
  per: string;
  views: Record<StorageKey, StorageView>;
  order: StorageKey[];
}

const ORDER: StorageKey[] = ["Total", "WIAG", "AWKG", "Liqui Moly"];

const statsOf = (s: { storage: { total: StorageStats; perPrincipal: Record<string, StorageStats> } }, key: StorageKey) =>
  key === "Total" ? s.storage.total : s.storage.perPrincipal[key]!;

/** Days with one decimal, whole numbers without: "17,3", "13". */
export const fmtDays = (n: number) => (Number.isInteger(n) ? fmtInt(n) : fmtDec(n));
const days = (n: number) => `${fmtDays(n)} ${n === 1 ? "day" : "days"}`;
/** Averages and changes always with one decimal. */
const avgDays = (n: number) => `${fmtDec(n)} days`;

export function storageSlide(set: ReportSet): StorageSlideModel {
  const period = set.current.period;
  const primary = set.comparisons.find((c) => c.kind === "lastYear") ?? set.comparisons.find((c) => c.kind === "previous") ?? null;
  const aligned = period.kind !== "month" && period.kind !== "custom";

  const views = Object.fromEntries(
    ORDER.map((key) => {
      const s = statsOf(set.current, key);
      const p = primary && activeIn(primary.report, key, set.current) ? statsOf(primary.report, key) : null;
      const pUsable = p && p.count > 0 ? p : null;
      const avgDelta = s.avgDays !== null && pUsable?.avgDays != null ? s.avgDays - pUsable.avgDays : null;
      const medianDelta = s.medianDays !== null && pUsable?.medianDays != null ? s.medianDays - pUsable.medianDays : null;
      const groups = STORAGE_BUCKETS.map((b) => ({
        bucket: b,
        label: STORAGE_GROUP_LABEL[b],
        count: s.buckets[b],
        share: s.count ? (s.buckets[b] / s.count) * 100 : null,
        ghostShare: pUsable ? (pUsable.buckets[b] / pUsable.count) * 100 : null,
      }));
      const perPeriod = s.perBucket.map((b, i) => ({
        ...b,
        ghostAvg: aligned && pUsable ? (pUsable.perBucket[i]?.avgDays ?? null) : null,
      }));

      const parts: string[] = [];
      if (s.avgDays === null) {
        parts.push("No HUs with a storage duration left the warehouse in this period.");
      } else {
        let change = "";
        if (avgDelta !== null && primary) {
          change = Math.abs(avgDelta) < 0.5
            ? `, about the same as in ${primary.report.period.label}`
            : `, ${avgDays(Math.abs(avgDelta))} ${avgDelta < 0 ? "shorter" : "longer"} than in ${primary.report.period.label}`;
        }
        parts.push(`HUs stayed ${avgDays(s.avgDays)} on average (median ${days(s.medianDays!)})${change}.`);
        const within30 = ((s.buckets["0-7"] + s.buckets["8-14"] + s.buckets["15-30"]) / s.count) * 100;
        if (key === "Total" && primary && avgDelta !== null) {
          // A principal without HUs in the comparison period changes the mix.
          for (const p of MAIN_PRINCIPALS) {
            const now = set.current.storage.perPrincipal[p];
            if (now.count > 0 && now.avgDays !== null && primary.report.storage.perPrincipal[p].count === 0) {
              parts.push(`${p}, not yet active in ${primary.report.period.label}, averages ${avgDays(now.avgDays)}.`);
            }
          }
        }
        // Keep the subtitle to one line: the mix sentence wins over the 30 day share.
        if (parts.length === 1) parts.push(`${fmtInt(within30)}% left the warehouse within 30 days.`);
      }
      const view: StorageView = {
        key,
        label: key === "Total" ? "All principals" : key,
        count: s.count,
        avgDays: s.avgDays,
        medianDays: s.medianDays,
        avgDelta,
        medianDelta,
        groups,
        perPeriod,
        headline: parts.join(" "),
      };
      return [key, view];
    }),
  ) as Record<StorageKey, StorageView>;

  return {
    title: "Storage duration",
    period,
    comparisonLabel: primary ? `vs ${primary.report.period.label}` : null,
    ghostLabel: primary ? primary.report.period.label : null,
    per: period.kind === "week" ? "Per day" : period.kind === "month" ? "Per week" : "Per month",
    views,
    order: ORDER.filter((k) => k === "Total" || (MAIN_PRINCIPALS as readonly string[]).includes(k)),
  };
}
