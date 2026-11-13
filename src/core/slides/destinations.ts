import type { ReportPeriod } from "../period";
import type { ReportSet } from "../report/report";
import type { StorageDestination } from "../report/storage";
import { countryName, fmtDec, fmtInt } from "./format";
import type { StorageKey } from "./storage";

/**
 * View model for storage per destination: the ten largest destinations by
 * HUs shipped, each with its average storage duration, per principal.
 * Deck texts are English.
 */

export const TOP_DESTINATIONS = 10;
/** A destination counts for "longest/shortest" with at least this share of the HUs (and 5 HUs). */
export const MIN_SHARE_FOR_EXTREMES = 0.005;

export interface DestinationRow {
  country: string;
  name: string;
  hus: number;
  /** Share of all HUs with a destination, in %. */
  share: number;
  avgDays: number;
  medianDays: number;
  /** Average days for this country in the comparison period (when it had enough HUs there). */
  ghostAvg: number | null;
}

export interface DestinationsView {
  key: StorageKey;
  label: string;
  hus: number;
  countries: number;
  /** Average days over all HUs with a destination. */
  avgDays: number | null;
  top: DestinationRow[];
  /** Share of HUs covered by the top destinations, in %. */
  topShare: number | null;
  longest: DestinationRow | null;
  shortest: DestinationRow | null;
  headline: string;
}

export interface DestinationsSlideModel {
  title: string;
  period: ReportPeriod;
  ghostLabel: string | null;
  views: Record<StorageKey, DestinationsView>;
  order: StorageKey[];
}

const ORDER: StorageKey[] = ["Total", "WIAG", "AWKG", "Liqui Moly"];
/** Averages always with one decimal, so figures line up: "20,0 days". */
const days = (n: number) => `${fmtDec(n)} days`;

export function destinationsSlide(set: ReportSet): DestinationsSlideModel {
  const primary = set.comparisons.find((c) => c.kind === "lastYear") ?? set.comparisons.find((c) => c.kind === "previous") ?? null;

  const views = Object.fromEntries(
    ORDER.map((key) => {
      const all = set.current.storageDestinations[key];
      const hus = all.reduce((a, r) => a + r.hus, 0);
      const minHus = Math.max(5, Math.ceil(hus * MIN_SHARE_FOR_EXTREMES));
      const prev = primary ? primary.report.storageDestinations[key] : [];
      const prevHus = prev.reduce((a, r) => a + r.hus, 0);
      const prevMin = Math.max(5, Math.ceil(prevHus * MIN_SHARE_FOR_EXTREMES));
      const row = (r: StorageDestination): DestinationRow => {
        const p = prev.find((x) => x.country === r.country);
        return {
          ...r,
          name: countryName(r.country),
          share: hus ? (r.hus / hus) * 100 : 0,
          ghostAvg: p && p.hus >= prevMin ? p.avgDays : null,
        };
      };
      const top = all.slice(0, TOP_DESTINATIONS).map(row);
      const eligible = all.filter((r) => r.hus >= minHus).map(row);
      const byDays = [...eligible].sort((a, b) => b.avgDays - a.avgDays || b.hus - a.hus);
      const avgDays = hus ? all.reduce((a, r) => a + r.avgDays * r.hus, 0) / hus : null;

      const parts: string[] = [];
      if (!top.length) {
        parts.push("No HUs with a destination left the warehouse in this period.");
      } else {
        const t = top[0]!;
        parts.push(`${t.name} was the largest destination with ${fmtInt(t.hus)} HUs (${fmtInt(t.share)}%), stored ${days(t.avgDays)} on average.`);
        const l = byDays[0];
        if (l && byDays.length > 1) parts.push(`Longest storage: ${l.name}, ${days(l.avgDays)} (${fmtInt(l.hus)} HUs).`);
      }

      const view: DestinationsView = {
        key,
        label: key === "Total" ? "All principals" : key,
        hus,
        countries: all.length,
        avgDays,
        top,
        topShare: hus ? (top.reduce((a, r) => a + r.hus, 0) / hus) * 100 : null,
        longest: byDays.length > 1 ? byDays[0]! : null,
        shortest: byDays.length > 1 ? byDays[byDays.length - 1]! : null,
        headline: parts.join(" "),
      };
      return [key, view];
    }),
  ) as Record<StorageKey, DestinationsView>;

  return {
    title: "Storage per destination",
    period: set.current.period,
    ghostLabel: primary ? primary.report.period.label : null,
    views,
    order: ORDER,
  };
}
