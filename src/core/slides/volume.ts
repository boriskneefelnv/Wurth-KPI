import { comparisonPeriod, type ComparisonKind, type ReportPeriod } from "../period";
import type { DayKey, Direction, MainPrincipal } from "../types";
import { deltaPct } from "../report/context";
import type { OperationalReport, ReportSet } from "../report/report";
import type { SeriesKey } from "../report/workload";
import { changeWords, countryName, fmtDay, fmtInt, plural } from "./format";

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
  /** One English sentence: the main change (or the totals without comparison). */
  headline: string;
  /** Supporting sentence(s): driver of the change and busiest day. */
  subline: string | null;
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

/** Country with the largest absolute change in outbound HUs, if it explains at least 40% of the change. */
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

/**
 * Headline: the change against the primary comparison (same period last year
 * if available, else the previous period); without comparison the totals.
 * Subline: what drives the outbound change, and the busiest day.
 */
function texts(set: ReportSet, key: SeriesKey, inbound: VolumePanel, outbound: VolumePanel): { headline: string; subline: string | null } {
  const primary = set.comparisons.find((c) => c.kind === "lastYear") ?? set.comparisons[0];
  let headline: string;
  const extra: string[] = [];
  const o = primary ? outbound.comparisons.find((c) => c.kind === primary.kind)! : null;
  const i = primary ? inbound.comparisons.find((c) => c.kind === primary.kind)! : null;
  if (primary && (o?.husDeltaPct != null || i?.husDeltaPct != null)) {
    const parts: string[] = [];
    if (o?.husDeltaPct != null) parts.push(`Outbound ${changeWords(o.husDeltaPct)} on ${primary.report.period.label}`);
    if (i?.husDeltaPct != null) parts.push(`${parts.length ? "inbound" : "Inbound"} ${changeWords(i.husDeltaPct)}${parts.length ? "" : ` on ${primary.report.period.label}`}`);
    headline = `${parts.join(", ")}.`;
    const driver = outboundDriver(set, key, primary.report);
    if (driver && o?.husDeltaPct != null && Math.abs(o.husDeltaPct) >= 5) {
      extra.push(
        driver.delta > 0
          ? `The outbound increase comes mainly from ${countryName(driver.country)} (${fmtInt(driver.delta)} more HUs).`
          : `The outbound decrease comes mainly from ${countryName(driver.country)} (${fmtInt(-driver.delta)} fewer HUs).`,
      );
    }
  } else {
    headline = `${plural(outbound.totalHus, "HU", "HUs")} out on ${plural(outbound.totalRides, "ride", "rides")}, ${plural(inbound.totalHus, "HU", "HUs")} in on ${plural(inbound.totalRides, "ride", "rides")}.`;
  }
  const peak = [inbound, outbound].filter((p) => p.peakDay).sort((a, b) => b.peakDay!.hus - a.peakDay!.hus)[0];
  if (peak?.peakDay) {
    extra.push(`Busiest day was ${fmtDay(peak.peakDay.day)} with ${plural(peak.peakDay.hus, "HU", "HUs")} ${peak.direction === "inbound" ? "in" : "out"}.`);
  }
  return { headline, subline: extra.length ? extra.join(" ") : null };
}

export function volumeSlide(set: ReportSet, subject: VolumeSlideSubject): VolumeSlideModel {
  const key = SUBJECT_KEY[subject];
  const ghost = pickGhost(set);
  const inbound = panel(set, key, "inbound", ghost?.report ?? null);
  const outbound = panel(set, key, "outbound", ghost?.report ?? null);
  return {
    subject,
    title: subject === "Total" ? "Volume total" : `Volume ${subject}`,
    period: set.current.period,
    buckets: set.current.perspectives.hus.volume.buckets.map(({ key: k, label }) => ({ key: k, label })),
    ghost: ghost ? { kind: ghost.kind, label: ghost.report.period.label } : null,
    inbound,
    outbound,
    ...texts(set, key, inbound, outbound),
  };
}
