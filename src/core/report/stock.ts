import { addDays, dayToDate } from "../period";
import type { DayKey, Principal, WmsUnit } from "../types";
import { PRINCIPALS } from "../types";
import type { ReportContext } from "./context";

export interface StockSnapshot {
  /** Snapshot taken at the end of this day (23:59:59.999). */
  day: DayKey;
  label: string;
  total: number;
  perPrincipal: Record<Principal, number>;
}

export interface StockBlock {
  /** One snapshot at the end of every bucket of the period. */
  snapshots: StockSnapshot[];
  /** Stock at the end of the day before the period starts. */
  startOfPeriod: StockSnapshot;
  /** Stock at the end of the period. */
  endOfPeriod: StockSnapshot;
  /** Absolute HU change over the period (end − start). Null when the data does not reach back to the start. */
  delta: { total: number; perPrincipal: Record<Principal, number> } | null;
}

/** In stock at `at` ⇔ inbound ≤ at and (no outbound or outbound > at). */
export function isInStock(u: WmsUnit, at: Date): boolean {
  return u.inslagUnit !== null && u.inslagUnit <= at && (u.uitslagUnit === null || u.uitslagUnit > at);
}

const endOfDay = (k: DayKey) => new Date(dayToDate(k).getTime() + 86_400_000 - 1);

export function snapshot(units: readonly WmsUnit[], day: DayKey, label = day): StockSnapshot {
  const at = endOfDay(day);
  const perPrincipal = Object.fromEntries(PRINCIPALS.map((p) => [p, 0])) as Record<Principal, number>;
  let total = 0;
  for (const u of units) {
    if (!isInStock(u, at)) continue;
    total++;
    perPrincipal[u.principal]++;
  }
  return { day, label, total, perPrincipal };
}

/**
 * Stock uses all units, not only those moved in the period: stock at a moment
 * depends on everything that came in before it.
 * NOTE: the layout of the stock slide (which snapshots, which comparison) is
 * still to be decided; this provides the building blocks.
 */
export function computeStock(ctx: ReportContext): StockBlock {
  const snapshots = ctx.buckets.map((b) => snapshot(ctx.units, b.to, b.label));
  const startDay = addDays(ctx.period.from, -1);
  const startOfPeriod = snapshot(ctx.units, startDay);
  const endOfPeriod = snapshot(ctx.units, ctx.period.to, ctx.period.label);
  const startAt = endOfDay(startDay);
  const hasHistory = ctx.units.some((u) => u.inslagUnit !== null && u.inslagUnit <= startAt);
  return {
    snapshots,
    startOfPeriod,
    endOfPeriod,
    delta: hasHistory
      ? {
          total: endOfPeriod.total - startOfPeriod.total,
          perPrincipal: Object.fromEntries(
            PRINCIPALS.map((p) => [p, endOfPeriod.perPrincipal[p] - startOfPeriod.perPrincipal[p]]),
          ) as Record<Principal, number>,
        }
      : null,
  };
}
