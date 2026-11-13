import { COMPLAINT_CATEGORIES, type ComplaintCategory } from "../complaints/portal";
import { bucketIndex, bucketsFor, type ReportPeriod } from "../period";
import type { ComplaintBlock, ComplaintItem, ComplaintKey, FreeLevel } from "../report/complaints";
import type { ReportSet } from "../report/report";
import { MAIN_PRINCIPALS } from "../types";

/**
 * View models for the complaint slides: the complaint-free KPIs (rides and
 * HUs) with complaints per month split by Sales and Vendor, and the
 * complaints by type with the latest complaints. Deck texts are English.
 */

export interface ComplaintsView {
  key: ComplaintKey;
  label: string;
  rides: FreeLevel & { deltaPts: number | null };
  hus: FreeLevel & { deltaPts: number | null };
  /** All complaints of this view in the period. */
  total: number;
  /** Not denied: these count in the KPI. */
  counted: number;
  denied: number;
  open: number;
  /** Counted complaints without a ride (warehouse: mostly batteries and labels). */
  warehouse: number;
  palletsAffected: number;
  /** Per bucket, counted complaints by origin, and the share of rides without complaint. */
  buckets: { key: string; label: string; sales: number; vendor: number; unassessed: number; ridesPct: number | null }[];
  categories: { category: ComplaintCategory; accepted: number; open: number; denied: number; total: number }[];
  /** Newest first. */
  latest: ComplaintItem[];
}

export interface ComplaintsSlideModel {
  period: ReportPeriod;
  target: number;
  comparisonLabel: string | null;
  views: Record<ComplaintKey, ComplaintsView>;
  order: ComplaintKey[];
}

const ORDER: ComplaintKey[] = ["Total", ...MAIN_PRINCIPALS];

export function complaintsSlide(set: ReportSet): ComplaintsSlideModel | null {
  const block = set.current.complaints;
  if (!block) return null;
  const primary = set.comparisons.find((c) => c.kind === "lastYear") ?? set.comparisons.find((c) => c.kind === "previous") ?? null;
  // Only compare when the complaints export reaches back to the comparison period.
  const covered = (from: string) => block.coverageFrom !== null && block.coverageFrom <= from;
  const prev: ComplaintBlock | null = primary && covered(primary.report.period.from) ? primary.report.complaints : null;

  const buckets = bucketsFor(set.current.period);
  const views = Object.fromEntries(
    ORDER.map((key) => {
      const k = block.kpi[key];
      const p = prev?.kpi[key];
      const items = block.items.filter((i) => key === "Total" || i.principal === key);
      const counted = items.filter((i) => i.counted);
      const delta = (a: number | null, b: number | null | undefined) => (a !== null && b !== null && b !== undefined ? a - b : null);
      const view: ComplaintsView = {
        key,
        label: key === "Total" ? "All principals" : key,
        rides: { ...k.rides, deltaPts: delta(k.rides.pct, p?.rides.pct) },
        hus: { ...k.hus, deltaPts: delta(k.hus.pct, p?.hus.pct) },
        total: items.length,
        counted: counted.length,
        denied: items.filter((i) => i.verdict === "denied").length,
        open: items.filter((i) => i.verdict === "open").length,
        warehouse: counted.filter((i) => i.direction === "warehouse").length,
        palletsAffected: counted.reduce((a, i) => a + (i.pallets && i.pallets > 0 ? i.pallets : 1), 0),
        buckets: k.perBucket.map((b, bi) => {
          const inB = counted.filter((i) => bucketIndex(buckets, i.day) === bi);
          return {
            key: b.key,
            label: b.label,
            sales: inB.filter((i) => i.origin === "sales").length,
            vendor: inB.filter((i) => i.origin === "vendor").length,
            unassessed: inB.filter((i) => i.origin === null).length,
            ridesPct: b.rides.pct,
          };
        }),
        categories: COMPLAINT_CATEGORIES.map((c) => {
          const xs = items.filter((i) => i.category === c);
          return {
            category: c,
            accepted: xs.filter((i) => i.verdict === "accepted").length,
            open: xs.filter((i) => i.verdict === "open").length,
            denied: xs.filter((i) => i.verdict === "denied").length,
            total: xs.length,
          };
        }).filter((c) => c.total > 0),
        latest: [...items].sort((a, b) => b.day.localeCompare(a.day) || b.klachtnr - a.klachtnr),
      };
      return [key, view];
    }),
  ) as Record<ComplaintKey, ComplaintsView>;

  return { period: set.current.period, target: block.target, comparisonLabel: primary && prev ? `vs ${primary.report.period.label}` : null, views, order: ORDER };
}
