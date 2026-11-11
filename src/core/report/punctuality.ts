import { TARGETS } from "../constants";
import { dayKey } from "../dates";
import type { DayKey, MainPrincipal, Period, Principal } from "../types";
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
  meetsTarget: boolean | null;
  /** Rides in scope that lack the dates to be measured. */
  notMeasurable: number;
  perPrincipal: Record<MainPrincipal, PunctualityCounts>;
  perPeriod: ({ period: Period } & PunctualityCounts)[];
  /** Rides that failed the rule, for drill-down. */
  exceptions: { ritNummer: string; principal: Principal; period: Period; actual: DayKey; planned: DayKey }[];
}

type Outcome = { ok: boolean; actual: DayKey; planned: DayKey } | null;

function aggregate(
  ctx: ReportContext,
  direction: "inbound" | "outbound",
  target: number,
  judge: (ritNummer: string) => Outcome,
): PunctualityResult {
  const zero = (): PunctualityCounts => ({ ok: 0, notOk: 0, pct: null });
  const total = zero();
  const perPrincipal = Object.fromEntries(MAIN_PRINCIPALS.map((p) => [p, zero()])) as Record<MainPrincipal, PunctualityCounts>;
  const perPeriod = new Map(ctx.selected.map((p) => [p, zero()]));
  const exceptions: PunctualityResult["exceptions"] = [];
  let notMeasurable = 0;

  for (const ride of selectedRides(ctx, direction)) {
    const outcome = judge(ride.ritNummer);
    if (!outcome) {
      notMeasurable++;
      continue;
    }
    const principal = dominantPrincipal(ride);
    const buckets = [total, perPeriod.get(ride.period)!];
    if ((MAIN_PRINCIPALS as readonly string[]).includes(principal)) buckets.push(perPrincipal[principal as MainPrincipal]);
    for (const b of buckets) outcome.ok ? b.ok++ : b.notOk++;
    if (!outcome.ok) {
      exceptions.push({ ritNummer: ride.ritNummer, principal, period: ride.period, actual: outcome.actual, planned: outcome.planned });
    }
  }

  const finish = (c: PunctualityCounts) => {
    c.pct = pct(c.ok, c.ok + c.notOk);
  };
  finish(total);
  Object.values(perPrincipal).forEach(finish);
  perPeriod.forEach(finish);

  return {
    ...total,
    target,
    meetsTarget: total.pct === null ? null : total.ok / (total.ok + total.notOk) >= target / 100,
    notMeasurable,
    perPrincipal,
    perPeriod: [...perPeriod].map(([period, c]) => ({ period, ...c })),
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
 * On-time loading per outbound ride (attributed to its canonical period).
 * Planned = earliest "Vertrek" of the ride. Actual = earliest outbound scan
 * (rule `earliest`, Lovable behaviour) or latest outbound scan (rule `latest`).
 * On time ⇔ actual day ≤ planned day.
 */
export function computeOnTimeLoading(ctx: ReportContext): PunctualityResult {
  const rule = ctx.options.onTimeRule;
  return aggregate(ctx, "outbound", TARGETS.onTimeLoadingPct, (rit) => {
    const units = ctx.unitsByRide.outbound.get(rit) ?? [];
    const planned = minDay(units.map((u) => u.vertrek));
    const outs = units.map((u) => u.uitslagUnit);
    const actual = rule === "latest" ? maxDay(outs) : minDay(outs);
    if (!planned || !actual) return null;
    return { ok: actual <= planned, actual, planned };
  });
}

/**
 * Inbound stocked per inbound ride: every HU of the ride must have an inbound
 * scan on or before the (earliest) unloading day.
 */
export function computeInboundStocked(ctx: ReportContext): PunctualityResult {
  return aggregate(ctx, "inbound", TARGETS.inboundStockedPct, (rit) => {
    const units = ctx.unitsByRide.inbound.get(rit) ?? [];
    const planned = minDay(units.map((u) => u.losdatum));
    if (!planned) return null;
    const latestIn = maxDay(units.map((u) => u.inslagUnit));
    const allScanned = units.every((u) => u.inslagUnit !== null);
    if (!latestIn) return null;
    return { ok: allScanned && latestIn <= planned, actual: latestIn, planned };
  });
}
