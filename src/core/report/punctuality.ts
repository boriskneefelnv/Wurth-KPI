import { TARGETS } from "../constants";
import { dayKey } from "../dates";
import { addDays, bucketIndex, isWorkday } from "../period";
import type { DayKey, MainPrincipal, Period, Principal, Ride } from "../types";
import { MAIN_PRINCIPALS } from "../types";
import { dominantPrincipal, pct, selectedRides, type ReportContext } from "./context";

export interface PunctualityCounts {
  ok: number;
  notOk: number;
  /** ok / (ok + notOk) × 100, null when nothing was measurable. */
  pct: number | null;
}

export interface PunctualityResult extends PunctualityCounts {
  target: number;
  /** Workdays after the planned day that still count as on time (0 = on the day). */
  graceWorkdays: number;
  /** Rides done on or before the planned day itself. */
  onPlannedDay: PunctualityCounts;
  meetsTarget: boolean | null;
  /** Rides in scope that lack the dates to be measured. */
  notMeasurable: number;
  perPrincipal: Record<MainPrincipal, PunctualityCounts>;
  /** Per bucket of the period (day, week or month), by the ride's planned day. */
  perBucket: ({ key: string; label: string } & PunctualityCounts)[];
  /** Per main principal, per bucket (same order as perBucket). */
  perBucketPerPrincipal: Record<MainPrincipal, PunctualityCounts[]>;
  /** Late rides by number of workdays late (1, 2, …). */
  lateByWorkdays: Record<number, number>;
  /** Rides that were late by at most one workday (for "within 1 workday"). */
  withinOneWorkday: PunctualityCounts;
  /** Rides that failed the rule, for drill-down. */
  exceptions: { ritNummer: string; principal: Principal; period: Period; actual: DayKey; planned: DayKey; workdaysLate: number }[];
}

type Outcome = { actual: DayKey; planned: DayKey } | null;

/** Workdays from `planned` to `actual` (0 when on or before the planned day). */
export function workdaysLate(planned: DayKey, actual: DayKey, holidays: ReadonlySet<DayKey>): number {
  if (actual <= planned) return 0;
  let n = 0;
  for (let d = addDays(planned, 1); d <= actual; d = addDays(d, 1)) if (isWorkday(d, holidays)) n++;
  return Math.max(1, n); // late on a weekend still counts as late
}

function aggregate(
  ctx: ReportContext,
  direction: "inbound" | "outbound",
  target: number,
  graceWorkdays: number,
  judge: (ride: Ride) => Outcome,
): PunctualityResult {
  const zero = (): PunctualityCounts => ({ ok: 0, notOk: 0, pct: null });
  const total = zero();
  const within = zero();
  const onDay = zero();
  const perPrincipal = Object.fromEntries(MAIN_PRINCIPALS.map((p) => [p, zero()])) as Record<MainPrincipal, PunctualityCounts>;
  const perBucket = ctx.buckets.map(zero);
  const perBucketPerPrincipal = Object.fromEntries(MAIN_PRINCIPALS.map((p) => [p, ctx.buckets.map(zero)])) as Record<MainPrincipal, PunctualityCounts[]>;
  const lateByWorkdays: Record<number, number> = {};
  const exceptions: PunctualityResult["exceptions"] = [];
  let notMeasurable = 0;

  for (const ride of selectedRides(ctx, direction)) {
    const outcome = judge(ride);
    if (!outcome) {
      notMeasurable++;
      continue;
    }
    const principal = dominantPrincipal(ride);
    const late = workdaysLate(outcome.planned, outcome.actual, ctx.holidays);
    const ok = late <= graceWorkdays;
    const buckets = [total];
    const bi = bucketIndex(ctx.buckets, ride.canonicalDate);
    if (bi !== -1) buckets.push(perBucket[bi]!);
    if ((MAIN_PRINCIPALS as readonly string[]).includes(principal)) {
      buckets.push(perPrincipal[principal as MainPrincipal]);
      if (bi !== -1) buckets.push(perBucketPerPrincipal[principal as MainPrincipal][bi]!);
    }
    for (const b of buckets) ok ? b.ok++ : b.notOk++;
    late <= 1 ? within.ok++ : within.notOk++;
    late === 0 ? onDay.ok++ : onDay.notOk++;
    if (!ok) {
      lateByWorkdays[late] = (lateByWorkdays[late] ?? 0) + 1;
      exceptions.push({ ritNummer: ride.ritNummer, principal, period: ride.period, actual: outcome.actual, planned: outcome.planned, workdaysLate: late });
    }
  }

  const finish = (c: PunctualityCounts) => {
    c.pct = pct(c.ok, c.ok + c.notOk);
  };
  finish(total);
  finish(within);
  finish(onDay);
  Object.values(perPrincipal).forEach(finish);
  perBucket.forEach(finish);
  Object.values(perBucketPerPrincipal).forEach((xs) => xs.forEach(finish));

  return {
    ...total,
    target,
    graceWorkdays,
    onPlannedDay: onDay,
    meetsTarget: total.pct === null ? null : total.ok / (total.ok + total.notOk) >= target / 100,
    notMeasurable,
    perPrincipal,
    perBucket: perBucket.map((c, i) => ({ key: ctx.buckets[i]!.key, label: ctx.buckets[i]!.label, ...c })),
    perBucketPerPrincipal,
    lateByWorkdays,
    withinOneWorkday: within,
    exceptions: exceptions.sort((a, b) => a.actual.localeCompare(b.actual)),
  };
}

const minDay = (dates: (Date | null)[]): DayKey | null => {
  let best: DayKey | null = null;
  for (const d of dates) {
    if (!d) continue;
    const k = dayKey(d);
    if (best === null || k < best) best = k;
  }
  return best;
};
const maxDay = (dates: (Date | null)[]): DayKey | null => {
  let best: DayKey | null = null;
  for (const d of dates) {
    if (!d) continue;
    const k = dayKey(d);
    if (best === null || k > best) best = k;
  }
  return best;
};

/**
 * On time loading per outbound ride (in the period of its planned day).
 * Planned: the Verwachte datum from Te laden (else the earliest "Vertrek" in
 * the unit file). Actual: the day the last pallet was scanned out (rule
 * `latest`, default) or the first (rule `earliest`, as in the Lovable tool).
 * On time ⇔ actual day ≤ planned day. The planned time is ignored: in the
 * ride lists it is 13:00 for 95% of the rides, a default rather than a slot.
 */
export function computeOnTimeLoading(ctx: ReportContext): PunctualityResult {
  const rule = ctx.options.onTimeRule;
  return aggregate(ctx, "outbound", TARGETS.onTimeLoadingPct, 0, (ride) => {
    const units = ctx.unitsByRide.outbound.get(ride.ritNummer) ?? [];
    const planned = ride.dateResolution === "planned" ? ride.canonicalDate : minDay(units.map((u) => u.vertrek));
    const outs = units.map((u) => u.uitslagUnit);
    const actual = rule === "latest" ? maxDay(outs) : minDay(outs);
    if (!planned || !actual) return null;
    return { actual, planned };
  });
}

/**
 * Inbound stocked on time per inbound ride: every pallet of the ride scanned
 * in (Inslag Unit) at the latest one workday after the Verwachte datum from
 * Te lossen (agreed with the user; `onPlannedDay` keeps the same-day share). Rides
 * without a ride list date are not measurable (the unit file has no reliable
 * warehouse unloading date).
 */
export function computeInboundStocked(ctx: ReportContext): PunctualityResult {
  return aggregate(ctx, "inbound", TARGETS.inboundStockedPct, TARGETS.inboundStockedGraceWorkdays, (ride) => {
    if (ride.dateResolution !== "planned") return null;
    const units = ctx.unitsByRide.inbound.get(ride.ritNummer) ?? [];
    const scanned = units.filter((u) => u.inslagUnit);
    if (!scanned.length) return null;
    const latestIn = maxDay(scanned.map((u) => u.inslagUnit));
    return { actual: latestIn!, planned: ride.canonicalDate };
  });
}
