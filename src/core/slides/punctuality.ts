import type { ComparisonKind, ReportPeriod } from "../period";
import type { PunctualityResult } from "../report/punctuality";
import type { OperationalReport, ReportSet } from "../report/report";
import type { MainPrincipal } from "../types";
import { MAIN_PRINCIPALS } from "../types";
import { fmtDec, fmtInt, plural } from "./format";

/**
 * View model for the on time slides: on time loading (outbound) and inbound
 * stocked on time. One large percentage against the target, the principals as
 * small figures, one chart per period bucket. Deck texts are English.
 */

export type PunctualityKind = "loading" | "stocking";

export interface PunctualitySlideModel {
  kind: PunctualityKind;
  title: string;
  /** Label above the large percentage. */
  label: string;
  period: ReportPeriod;
  pct: number | null;
  target: number;
  meetsTarget: boolean | null;
  ok: number;
  measured: number;
  /** Stocking: share stocked on the unloading day itself (the target allows one workday). */
  secondary: { label: string; pct: number | null } | null;
  /** Change in percentage points against each comparison period. */
  comparisons: { kind: ComparisonKind; label: string; pct: number | null; deltaPts: number | null }[];
  /** Change in points against the main comparison (last year when available). */
  deltaPts: number | null;
  deltaLabel: string | null;
  perPrincipal: { principal: MainPrincipal; pct: number | null; ok: number; measured: number; deltaPts: number | null }[];
  buckets: {
    key: string;
    label: string;
    pct: number | null;
    measured: number;
    ghostPct: number | null;
    perPrincipal: Record<MainPrincipal, number | null>;
  }[];
  ghost: { kind: ComparisonKind; label: string } | null;
  late: { total: number; oneWorkday: number };
  headline: string;
  context: string | null;
}

const pick = (r: OperationalReport, kind: PunctualityKind): PunctualityResult => (kind === "loading" ? r.onTimeLoading : r.inboundStocked);

/** Change in points, as words: "up 1,3 points", "down 0,8 points", "stable". */
function pointsWords(d: number): string {
  if (Math.abs(d) < 0.05) return "stable";
  return `${d > 0 ? "up" : "down"} ${fmtDec(Math.abs(d))} ${Math.abs(d) === 1 ? "point" : "points"}`;
}

export function punctualitySlide(set: ReportSet, kind: PunctualityKind): PunctualitySlideModel {
  const cur = pick(set.current, kind);
  const measured = cur.ok + cur.notOk;
  const period = set.current.period;
  const periodKind = period.kind;
  const aligned = periodKind !== "month" && periodKind !== "custom";
  const ghostCmp = aligned ? (set.comparisons.find((c) => c.kind === "lastYear") ?? set.comparisons.find((c) => c.kind === "previous")) : undefined;
  const ghostRes = ghostCmp ? pick(ghostCmp.report, kind) : null;

  const comparisons = set.comparisons.map(({ kind: ck, report }) => {
    const r = pick(report, kind);
    return {
      kind: ck,
      label: `vs ${report.period.label}`,
      pct: r.pct,
      deltaPts: cur.pct !== null && r.pct !== null ? cur.pct - r.pct : null,
    };
  });

  const late = { total: cur.notOk, oneWorkday: cur.lateByWorkdays[1] ?? 0 };

  // Texts
  const subject = kind === "loading" ? "outbound rides were fully loaded on the planned day" : "inbound rides were stocked within one workday";
  let headline: string;
  if (cur.pct === null) {
    headline = kind === "loading" ? "No measurable outbound rides in this period." : "No measurable inbound rides in this period.";
  } else {
    const vsTarget = cur.meetsTarget ? `above the ${cur.target}% target` : `below the ${cur.target}% target`;
    headline = `${fmtDec(cur.pct)}% of ${subject}, ${vsTarget}.`;
  }
  const context: string[] = [];
  const primary = comparisons.find((c) => c.kind === "lastYear" && c.deltaPts !== null) ?? comparisons.find((c) => c.deltaPts !== null);
  const primaryReport = primary ? set.comparisons.find((c) => c.kind === primary.kind)?.report ?? null : null;
  if (primary && primary.deltaPts !== null) {
    const w = pointsWords(primary.deltaPts);
    context.push(`${w.charAt(0).toUpperCase()}${w.slice(1)} on ${primary.label.replace(/^vs /, "")}.`);
  }
  if (late.total > 0 && kind === "stocking") {
    context.push(`${plural(late.total, "ride took", "rides took")} longer.`);
  } else if (late.total > 0) {
    context.push(
      late.oneWorkday === late.total
        ? `${plural(late.total, "ride was", "rides were")} late, all by one workday.`
        : `${plural(late.total, "ride was", "rides were")} late, ${fmtInt(late.oneWorkday)} of them by one workday.`,
    );
  }

  return {
    kind,
    title: kind === "loading" ? "On time loading" : "Inbound stocked on time",
    label: kind === "loading" ? "Rides loaded on time" : "Rides stocked within one workday",
    period,
    pct: cur.pct,
    target: cur.target,
    meetsTarget: cur.meetsTarget,
    ok: cur.ok,
    measured,
    secondary: kind === "stocking" ? { label: "On the unloading day", pct: cur.onPlannedDay.pct } : null,
    comparisons,
    deltaPts: primary?.deltaPts ?? null,
    deltaLabel: primary?.label ?? null,
    perPrincipal: MAIN_PRINCIPALS.map((p) => {
      const c = cur.perPrincipal[p];
      const prev = primaryReport ? pick(primaryReport, kind).perPrincipal[p].pct : null;
      return { principal: p, pct: c.pct, ok: c.ok, measured: c.ok + c.notOk, deltaPts: c.pct !== null && prev !== null ? c.pct - prev : null };
    }),
    buckets: cur.perBucket.map((b, i) => ({
      key: b.key,
      label: b.label,
      pct: b.pct,
      measured: b.ok + b.notOk,
      ghostPct: ghostRes?.perBucket[i]?.pct ?? null,
      perPrincipal: Object.fromEntries(MAIN_PRINCIPALS.map((p) => [p, cur.perBucketPerPrincipal[p][i]?.pct ?? null])) as Record<MainPrincipal, number | null>,
    })),
    ghost: ghostCmp && ghostRes ? { kind: ghostCmp.kind, label: ghostCmp.report.period.label } : null,
    late,
    headline,
    context: context.length ? context.join(" ") : null,
  };
}
