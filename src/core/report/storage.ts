import { STORAGE_TOP } from "../constants";
import type { Principal, StorageBucket, WmsUnit } from "../types";
import { PRINCIPALS, STORAGE_BUCKETS } from "../types";
import { mean, median, type ReportContext } from "./context";

export interface StorageStats {
  count: number;
  avgDays: number | null;
  medianDays: number | null;
  buckets: Record<StorageBucket, number>;
}

export interface StorageBlock {
  total: StorageStats;
  perPrincipal: Record<Principal, StorageStats>;
}

function stats(units: readonly WmsUnit[]): StorageStats {
  const days = units.map((u) => u.dagenInOpslag!);
  const buckets = Object.fromEntries(STORAGE_BUCKETS.map((b) => [b, 0])) as Record<StorageBucket, number>;
  for (const u of units) buckets[u.storageBucket!]++;
  return { count: units.length, avgDays: mean(days), medianDays: median(days), buckets };
}

/** HUs that left the warehouse in a selected month and have a storage duration. */
export function storagePopulation(ctx: ReportContext): WmsUnit[] {
  return ctx.units.filter(
    (u) => u.outboundPeriod !== null && ctx.selectedSet.has(u.outboundPeriod) && u.dagenInOpslag !== null,
  );
}

export function computeStorage(ctx: ReportContext): StorageBlock {
  const pop = storagePopulation(ctx);
  return {
    total: stats(pop),
    perPrincipal: Object.fromEntries(PRINCIPALS.map((p) => [p, stats(pop.filter((u) => u.principal === p))])) as Record<
      Principal,
      StorageStats
    >,
  };
}

export interface StorageDestination {
  country: string;
  hus: number;
  avgDays: number;
  /** Null when the principal has fewer than 3 HUs to this country. */
  perPrincipal: Record<Principal, { hus: number; avgDays: number | null }>;
}

export interface StorageTopBlock {
  /** Countries with ≥5 HUs, by average storage days desc, top 10. */
  overall: StorageDestination[];
  /** Per principal: countries with ≥5 HUs of that principal, top 8. */
  perPrincipal: Record<Principal, { country: string; hus: number; avgDays: number }[]>;
}

export function computeStorageTop(ctx: ReportContext): StorageTopBlock {
  const pop = storagePopulation(ctx).filter((u) => u.losLand);
  const byCountry = new Map<string, WmsUnit[]>();
  for (const u of pop) {
    let l = byCountry.get(u.losLand!);
    if (!l) byCountry.set(u.losLand!, (l = []));
    l.push(u);
  }

  const overall: StorageDestination[] = [];
  for (const [country, units] of byCountry) {
    if (units.length < STORAGE_TOP.minHusPerCountry) continue;
    const perPrincipal = {} as StorageDestination["perPrincipal"];
    for (const p of PRINCIPALS) {
      const pu = units.filter((u) => u.principal === p);
      perPrincipal[p] = {
        hus: pu.length,
        avgDays: pu.length >= STORAGE_TOP.minHusPerPrincipalDot ? mean(pu.map((u) => u.dagenInOpslag!)) : null,
      };
    }
    overall.push({ country, hus: units.length, avgDays: mean(units.map((u) => u.dagenInOpslag!))!, perPrincipal });
  }
  overall.sort((a, b) => b.avgDays - a.avgDays || b.hus - a.hus);

  const perPrincipal = {} as StorageTopBlock["perPrincipal"];
  for (const p of PRINCIPALS) {
    const rows: { country: string; hus: number; avgDays: number }[] = [];
    for (const [country, units] of byCountry) {
      const pu = units.filter((u) => u.principal === p);
      if (pu.length < STORAGE_TOP.minHusPerCountry) continue;
      rows.push({ country, hus: pu.length, avgDays: mean(pu.map((u) => u.dagenInOpslag!))! });
    }
    perPrincipal[p] = rows.sort((a, b) => b.avgDays - a.avgDays || b.hus - a.hus).slice(0, STORAGE_TOP.perPrincipalTopN);
  }

  return { overall: overall.slice(0, STORAGE_TOP.topN), perPrincipal };
}
