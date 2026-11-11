import type { MainPrincipal } from "../types";
import { MAIN_PRINCIPALS } from "../types";
import type { ReportContext } from "./context";
import { mean } from "./context";
import { principalCountryHus } from "./outbound";
import type { ProfileLabel, PrincipalProfile } from "./profiles";
import type { StockBlock } from "./stock";
import type { StorageBlock } from "./storage";
import type { VolumeBlock } from "./workload";

/** Stable slide ids, so takeaways keep pointing at the right slide when the deck changes. */
export type SlideId =
  | "volume-wiag"
  | "volume-awkg"
  | "volume-lm"
  | "volume-total"
  | "world-map"
  | "storage"
  | "container-mix"
  | "principal-profiles"
  | "stock";

export interface Insight {
  kind: "principal-mom" | "top-destination" | "storage-outlier" | "peak-month" | "ride-efficiency" | "stock-trend";
  /** English, for the customer deck. */
  text: string;
  score: number;
  slide: SlideId;
}

const VOLUME_SLIDE: Record<MainPrincipal, SlideId> = {
  WIAG: "volume-wiag",
  AWKG: "volume-awkg",
  "Liqui Moly": "volume-lm",
};

const fmtPct = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(0)}%`;

/**
 * Scored, automatically generated takeaways (HU perspective), sorted by score.
 * Trend rules compare the last two buckets of the period (days, weeks or months).
 * NOTE: to be revisited once comparisons with previous periods are on the slides.
 */
export function computeInsights(
  ctx: ReportContext,
  input: {
    volumeHus: VolumeBlock;
    storage: StorageBlock;
    profiles: Record<MainPrincipal, PrincipalProfile>;
    stock: StockBlock;
    avgHusPerRide: number | null;
  },
): Insight[] {
  const insights: Insight[] = [];
  const { volumeHus: vol } = input;
  const completeIdx = vol.buckets.map((_, i) => i);

  // 1. Principal outbound change between the last two buckets
  if (completeIdx.length >= 2) {
    const [a, b] = completeIdx.slice(-2) as [number, number];
    for (const p of MAIN_PRINCIPALS) {
      const prev = vol.outbound[p].buckets[a]!;
      const cur = vol.outbound[p].buckets[b]!;
      if (prev === 0 || cur === 0) continue;
      const deltaPct = ((cur - prev) / prev) * 100;
      if (Math.abs(deltaPct) < 10) continue;
      insights.push({
        kind: "principal-mom",
        text: `${p} outbound volume ${deltaPct > 0 ? "rose" : "fell"} ${fmtPct(deltaPct)} from ${vol.buckets[a]!.label} to ${vol.buckets[b]!.label} (${prev.toLocaleString("en-GB")} → ${cur.toLocaleString("en-GB")} HUs).`,
        score: Math.abs(deltaPct) * Math.sqrt(cur),
        slide: VOLUME_SLIDE[p],
      });
    }
  }

  // 2. Principal top destination concentration
  for (const p of MAIN_PRINCIPALS) {
    const countries = principalCountryHus(ctx, p);
    const total = [...countries.values()].reduce((x, y) => x + y, 0);
    if (!total) continue;
    const [country, n] = [...countries].sort((x, y) => y[1] - x[1])[0]!;
    const share = (n / total) * 100;
    if (share < 15) continue;
    insights.push({
      kind: "top-destination",
      text: `${share.toFixed(0)}% of ${p} outbound HUs went to ${country}.`,
      score: share * 10,
      slide: "world-map",
    });
  }

  // 3. Storage outlier
  const overall = input.storage.total.avgDays;
  if (overall !== null) {
    for (const p of MAIN_PRINCIPALS) {
      const avg = input.storage.perPrincipal[p].avgDays;
      if (avg === null) continue;
      const delta = avg - overall;
      if (Math.abs(delta) < 3) continue;
      insights.push({
        kind: "storage-outlier",
        text: `${p} goods stay ${Math.abs(delta).toFixed(1)} days ${delta > 0 ? "longer" : "shorter"} in storage than average (${avg.toFixed(1)} vs ${overall.toFixed(1)} days).`,
        score: Math.abs(delta) * 5,
        slide: "storage",
      });
    }
  }

  // 4. Peak bucket (outbound total)
  const complete = completeIdx.map((i) => vol.outbound.Total.buckets[i]!);
  const m = mean(complete);
  if (m && complete.length >= 2) {
    const peakIdx = completeIdx.reduce((best, i) => (vol.outbound.Total.buckets[i]! > vol.outbound.Total.buckets[best]! ? i : best));
    const peak = vol.outbound.Total.buckets[peakIdx]!;
    const pctAbove = ((peak - m) / m) * 100;
    if (pctAbove >= 30) {
      insights.push({
        kind: "peak-month",
        text: `${vol.buckets[peakIdx]!.label} was the busiest with ${peak.toLocaleString("en-GB")} outbound HUs, ${pctAbove.toFixed(0)}% above average.`,
        score: pctAbove * 2,
        slide: "volume-total",
      });
    }
  }

  // 5. Ride efficiency (HUs per outbound ride)
  if (input.avgHusPerRide !== null) {
    for (const p of MAIN_PRINCIPALS) {
      const hpr = input.profiles[p].husPerRide;
      if (hpr === null) continue;
      const delta = hpr - input.avgHusPerRide;
      if (Math.abs(delta) < 5) continue;
      insights.push({
        kind: "ride-efficiency",
        text: `${p} averages ${hpr.toFixed(1)} HUs per outbound ride, ${Math.abs(delta).toFixed(1)} ${delta > 0 ? "more" : "fewer"} than the overall ${input.avgHusPerRide.toFixed(1)}.`,
        score: Math.abs(delta) * 3,
        slide: "principal-profiles",
      });
    }
  }

  // 6. Stock trend over the period
  const { delta, startOfPeriod, endOfPeriod } = input.stock;
  if (delta && startOfPeriod.total > 0) {
    const deltaPct = (delta.total / startOfPeriod.total) * 100;
    if (Math.abs(deltaPct) >= 5) {
      insights.push({
        kind: "stock-trend",
        text: `Stock ${deltaPct > 0 ? "grew" : "decreased"} ${fmtPct(deltaPct)} during ${ctx.period.label}, from ${startOfPeriod.total.toLocaleString("en-GB")} to ${endOfPeriod.total.toLocaleString("en-GB")} HUs.`,
        score: Math.abs(deltaPct) * Math.sqrt(endOfPeriod.total || 1),
        slide: "stock",
      });
    }
  }

  return insights.sort((a, b) => b.score - a.score);
}

export type { ProfileLabel };
