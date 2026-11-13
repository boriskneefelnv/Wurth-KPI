import type { MainPrincipal, Principal, StorageBucket, WmsUnit } from "../types";
import { MAIN_PRINCIPALS, PRINCIPALS, STORAGE_BUCKETS } from "../types";
import { bucketIndex } from "../period";
import { mean, median, type ReportContext } from "./context";

export interface StorageStats {
  count: number;
  avgDays: number | null;
  medianDays: number | null;
  buckets: Record<StorageBucket, number>;
  /** Per trend bucket of the period (by the day the HU left, as in volume). */
  perBucket: { key: string; label: string; count: number; avgDays: number | null; medianDays: number | null }[];
}

export interface StorageBlock {
  total: StorageStats;
  perPrincipal: Record<Principal, StorageStats>;
}

function stats(ctx: ReportContext, units: readonly WmsUnit[]): StorageStats {
  const days = units.map((u) => u.dagenInOpslag!);
  const buckets = Object.fromEntries(STORAGE_BUCKETS.map((b) => [b, 0])) as Record<StorageBucket, number>;
  for (const u of units) buckets[u.storageBucket!]++;
  const per = ctx.buckets.map(() => [] as number[]);
  for (const u of units) {
    const i = bucketIndex(ctx.buckets, ctx.unitDay(u, "outbound")!);
    if (i !== -1) per[i]!.push(u.dagenInOpslag!);
  }
  return {
    count: units.length,
    avgDays: mean(days),
    medianDays: median(days),
    buckets,
    perBucket: per.map((xs, i) => ({ key: ctx.buckets[i]!.key, label: ctx.buckets[i]!.label, count: xs.length, avgDays: mean(xs), medianDays: median(xs) })),
  };
}

/** HUs that left the warehouse in the period and have a storage duration. */
export function storagePopulation(ctx: ReportContext): WmsUnit[] {
  return ctx.units.filter(
    (u) => ctx.unitInPeriod(u, "outbound") && u.dagenInOpslag !== null,
  );
}

export function computeStorage(ctx: ReportContext): StorageBlock {
  const pop = storagePopulation(ctx);
  return {
    total: stats(ctx, pop),
    perPrincipal: Object.fromEntries(PRINCIPALS.map((p) => [p, stats(ctx, pop.filter((u) => u.principal === p))])) as Record<
      Principal,
      StorageStats
    >,
  };
}

export interface StorageDestination {
  /** Destination country ("Los land", ISO code). */
  country: string;
  hus: number;
  avgDays: number;
  medianDays: number;
}

/** Per view (all principals, or one main principal): every destination, most HUs first. */
export type StorageDestinationsBlock = Record<MainPrincipal | "Total", StorageDestination[]>;

/**
 * Storage duration per destination country, over the same HUs as
 * computeStorage. HUs without a destination are left out.
 */
export function computeStorageDestinations(ctx: ReportContext): StorageDestinationsBlock {
  const pop = storagePopulation(ctx).filter((u) => u.losLand);
  const rows = (units: WmsUnit[]): StorageDestination[] => {
    const byCountry = new Map<string, number[]>();
    for (const u of units) {
      let l = byCountry.get(u.losLand!);
      if (!l) byCountry.set(u.losLand!, (l = []));
      l.push(u.dagenInOpslag!);
    }
    return [...byCountry]
      .map(([country, days]) => ({ country, hus: days.length, avgDays: mean(days)!, medianDays: median(days)! }))
      .sort((a, b) => b.hus - a.hus || a.country.localeCompare(b.country));
  };
  return {
    Total: rows(pop),
    ...Object.fromEntries(MAIN_PRINCIPALS.map((p) => [p, rows(pop.filter((u) => u.principal === p))])),
  } as StorageDestinationsBlock;
}
