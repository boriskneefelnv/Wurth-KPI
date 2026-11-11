import { periodEnd, shiftPeriod } from "../dates";
import type { Period, Principal, WmsUnit } from "../types";
import { PRINCIPALS } from "../types";
import type { ReportContext } from "./context";

export interface StockSnapshot {
  period: Period;
  total: number;
  perPrincipal: Record<Principal, number>;
}

export interface StockBlock {
  /** Month-end snapshots shown on the slide. */
  snapshots: StockSnapshot[];
  /** Snapshot at the end of the last selected month. */
  endOfPeriod: StockSnapshot | null;
  /**
   * Absolute HU change of the last shown month vs the calendar month before it
   * (month-over-month). Null when the data does not reach back that far.
   */
  delta: { from: Period; to: Period; total: number; perPrincipal: Record<Principal, number> } | null;
}

/** In stock at `at` ⇔ inbound ≤ at and (no outbound or outbound > at). */
export function isInStock(u: WmsUnit, at: Date): boolean {
  return u.inslagUnit !== null && u.inslagUnit <= at && (u.uitslagUnit === null || u.uitslagUnit > at);
}

export function snapshot(units: readonly WmsUnit[], period: Period): StockSnapshot {
  const at = periodEnd(period);
  const perPrincipal = Object.fromEntries(PRINCIPALS.map((p) => [p, 0])) as Record<Principal, number>;
  let total = 0;
  for (const u of units) {
    if (!isInStock(u, at)) continue;
    total++;
    perPrincipal[u.principal]++;
  }
  return { period, total, perPrincipal };
}

/**
 * Stock uses all units (not only the selected months): stock at a month end
 * depends on everything that came in before it.
 */
export function computeStock(ctx: ReportContext): StockBlock {
  if (ctx.selected.length === 0) return { snapshots: [], endOfPeriod: null, delta: null };
  const last = ctx.selected[ctx.selected.length - 1]!;
  const shown =
    ctx.selected.length === 1 ? [-5, -4, -3, -2, -1, 0].map((k) => shiftPeriod(last, k)) : [...ctx.selected];

  const snapshots = shown.map((p) => snapshot(ctx.units, p));
  const endOfPeriod = snapshots[snapshots.length - 1]!;

  const baselinePeriod = shiftPeriod(last, -1);
  const baselineEnd = periodEnd(baselinePeriod);
  const hasHistory = ctx.units.some((u) => u.inslagUnit !== null && u.inslagUnit <= baselineEnd);
  let delta: StockBlock["delta"] = null;
  if (hasHistory) {
    const base = snapshots.find((s) => s.period === baselinePeriod) ?? snapshot(ctx.units, baselinePeriod);
    delta = {
      from: baselinePeriod,
      to: last,
      total: endOfPeriod.total - base.total,
      perPrincipal: Object.fromEntries(
        PRINCIPALS.map((p) => [p, endOfPeriod.perPrincipal[p] - base.perPrincipal[p]]),
      ) as Record<Principal, number>,
    };
  }
  return { snapshots, endOfPeriod, delta };
}
