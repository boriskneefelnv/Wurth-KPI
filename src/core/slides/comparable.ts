import type { OperationalReport, ReportSet } from "../report/report";
import type { SeriesKey } from "../report/workload";

/**
 * True when a comparison period is meaningful for the entity (or all
 * principals): it had volume then, and it did not only start during that
 * period. "Started during the period": nothing in its first month (week,
 * day) and less than a quarter of the current volume. Without this, a principal that
 * started late in the comparison period (AWKG in 2025) shows changes like
 * +700%. Real growth of an entity that was already active stays visible.
 */
export function activeIn(comparison: OperationalReport, key: SeriesKey, current?: OperationalReport): boolean {
  const vol = (r: OperationalReport) => {
    const v = r.perspectives.hus.volume;
    return { total: v.inbound[key].total + v.outbound[key].total, first: (v.inbound[key].buckets[0] ?? 0) + (v.outbound[key].buckets[0] ?? 0) };
  };
  const c = vol(comparison);
  if (c.total === 0) return false;
  if (!current) return true;
  const now = vol(current).total;
  return !(c.first === 0 && c.total < 0.25 * now);
}

/** The report set with only the comparisons that are meaningful for the entity. */
export function comparableSet(set: ReportSet, key: SeriesKey): ReportSet {
  return { ...set, comparisons: set.comparisons.filter((c) => activeIn(c.report, key, set.current)) };
}
