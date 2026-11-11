import { comparisonPeriod, type ComparisonKind, type ReportPeriod } from "../period";
import type { DayKey, Direction, MainPrincipal } from "../types";
import { deltaPct } from "../report/context";
import type { OperationalReport, ReportSet } from "../report/report";
import type { SeriesKey } from "../report/workload";

/**
 * View model for a volume slide (design A: inbound and outbound panels).
 * Bars = HUs per bucket, figure under each bar = rides, optional ghost bars =
 * the same bucket in a comparison period. Deck texts are English.
 */

export type VolumeSlideSubject = MainPrincipal | "Total";

export interface ComparisonFigures {
  kind: ComparisonKind;
  period: ReportPeriod;
  /** e.g. "vs Q1 2026" */
  label: string;
  hus: number;
  rides: number;
  husDeltaPct: number | null;
  ridesDeltaPct: number | null;
}

export interface VolumePanel {
  direction: Direction;
  hus: number[];
  rides: number[];
  /** Same buckets in the ghost comparison period; null when no ghost bars are drawn. */
  ghostHus: number[] | null;
  totalHus: number;
  totalRides: number;
  husPerWorkday: number | null;
  husPerRide: number | null;
  peakDay: { day: DayKey; hus: number } | null;
  comparisons: ComparisonFigures[];
}

export interface VolumeSlideModel {
  subject: VolumeSlideSubject;
  title: string;
  period: ReportPeriod;
  buckets: { key: string; label: string }[];
  /** Which comparison the ghost bars show (and its label for the legend). */
  ghost: { kind: ComparisonKind; label: string } | null;
  inbound: VolumePanel;
  outbound: VolumePanel;
  /** 0–2 short English sentences for the slide footer. */
  insights: string[];
}

const SUBJECT_KEY: Record<VolumeSlideSubject, SeriesKey> = {
  WIAG: "WIAG",
  AWKG: "AWKG",
  "Liqui Moly": "Liqui Moly",
  Total: "Total",
};

/**
 * Ghost bars only when buckets line up one-to-one: week (days) and
 * quarter/half/year (months). A month report has 4–6 partial weeks, so its
 * comparison is shown as totals only. Same period last year is preferred
 * (seasonality), otherwise the previous period.
 */
function pickGhost(set: ReportSet): ReportSet["comparisons"][number] | null {
  const kind = set.current.period.kind;
  if (kind === "month" || kind === "custom") return null;
  return set.comparisons.find((c) => c.kind === "lastYear") ?? set.comparisons.find((c) => c.kind === "previous") ?? null;
}

function panel(set: ReportSet, key: SeriesKey, direction: Direction, ghost: OperationalReport | null): VolumePanel {
  const hu = set.current.perspectives.hus.volume[direction][key];
  const ride = set.current.perspectives.rides.volume[direction][key];
  return {
    direction,
    hus: hu.buckets,
    rides: ride.buckets,
    ghostHus: ghost ? ghost.perspectives.hus.volume[direction][key].buckets : null,
    totalHus: hu.total,
    totalRides: ride.total,
    husPerWorkday: hu.avgPerWorkday,
    husPerRide: ride.total > 0 ? hu.total / ride.total : null,
    peakDay: hu.peakDay ? { day: hu.peakDay.day, hus: hu.peakDay.value } : null,
    comparisons: set.comparisons.map(({ kind, report }) => {
      const cHu = report.perspectives.hus.volume[direction][key].total;
      const cRide = report.perspectives.rides.volume[direction][key].total;
      return {
        kind,
        period: report.period,
        label: `vs ${comparisonPeriod(set.current.period, kind).label}`,
        hus: cHu,
        rides: cRide,
        husDeltaPct: deltaPct(hu.total, cHu),
        ridesDeltaPct: deltaPct(ride.total, cRide),
      };
    }),
  };
}

const n = (x: number) => Math.round(x).toLocaleString("en-GB");
const rides = (x: number) => `${n(x)} ${x === 1 ? "ride" : "rides"}`;
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x))}%`;

/** Country with the largest absolute change in outbound HUs, if it explains ≥ 40% of the change. */
function outboundDriver(set: ReportSet, key: SeriesKey, comparison: OperationalReport): { country: string; delta: number } | null {
  const husIn = (r: OperationalReport) => {
    const m = new Map<string, number>();
    for (const c of r.outbound.countries) m.set(c.country, key === "Total" ? c.hus : c.perPrincipal[key].hus);
    return m;
  };
  const cur = husIn(set.current);
  const prev = husIn(comparison);
  const total = [...cur.values()].reduce((a, b) => a + b, 0) - [...prev.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let best: { country: string; delta: number } | null = null;
  for (const country of new Set([...cur.keys(), ...prev.keys()])) {
    const delta = (cur.get(country) ?? 0) - (prev.get(country) ?? 0);
    if (Math.sign(delta) === Math.sign(total) && (!best || Math.abs(delta) > Math.abs(best.delta))) best = { country, delta };
  }
  return best && Math.abs(best.delta) >= 0.4 * Math.abs(total) ? best : null;
}

function insightsFor(set: ReportSet, key: SeriesKey, inbound: VolumePanel, outbound: VolumePanel): string[] {
  const out: string[] = [];
  // Primary comparison for the text: same period last year if available, else previous.
  const primary = set.comparisons.find((c) => c.kind === "lastYear") ?? set.comparisons[0];
  if (primary) {
    const o = outbound.comparisons.find((c) => c.kind === primary.kind)!;
    const i = inbound.comparisons.find((c) => c.kind === primary.kind)!;
    const parts: string[] = [];
    if (o.husDeltaPct !== null) parts.push(`Outbound ${signed(o.husDeltaPct)} ${o.label} (${n(outbound.totalHus)} HUs)`);
    if (i.husDeltaPct !== null) parts.push(`inbound ${signed(i.husDeltaPct)} (${n(inbound.totalHus)} HUs)`);
    if (parts.length) {
      let sentence = parts.join(", ");
      const driver = outboundDriver(set, key, primary.report);
      if (driver && o.husDeltaPct !== null && Math.abs(o.husDeltaPct) >= 5) {
        sentence += `; outbound change mainly ${driver.delta > 0 ? "from more" : "from fewer"} HUs to ${driver.country} (${driver.delta > 0 ? "+" : "−"}${n(Math.abs(driver.delta))})`;
      }
      out.push(`${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`);
    }
  } else if (outbound.totalHus + inbound.totalHus > 0) {
    out.push(`${n(inbound.totalHus)} HUs in on ${rides(inbound.totalRides)}, ${n(outbound.totalHus)} HUs out on ${rides(outbound.totalRides)}.`);
  }
  const peak = [inbound, outbound]
    .filter((p) => p.peakDay)
    .sort((a, b) => b.peakDay!.hus - a.peakDay!.hus)[0];
  if (peak?.peakDay && peak.husPerWorkday) {
    const d = peak.peakDay.day;
    out.push(
      `Busiest day: ${d.slice(8)}-${d.slice(5, 7)} with ${n(peak.peakDay.hus)} HUs ${peak.direction === "inbound" ? "in" : "out"} (average ${n(peak.husPerWorkday)} per workday).`,
    );
  }
  return out;
}

export function volumeSlide(set: ReportSet, subject: VolumeSlideSubject): VolumeSlideModel {
  const key = SUBJECT_KEY[subject];
  const ghost = pickGhost(set);
  const inbound = panel(set, key, "inbound", ghost?.report ?? null);
  const outbound = panel(set, key, "outbound", ghost?.report ?? null);
  return {
    subject,
    title: `Volume — ${subject}`,
    period: set.current.period,
    buckets: set.current.perspectives.hus.volume.buckets.map(({ key: k, label }) => ({ key: k, label })),
    ghost: ghost ? { kind: ghost.kind, label: ghost.report.period.label } : null,
    inbound,
    outbound,
    insights: insightsFor(set, key, inbound, outbound),
  };
}
