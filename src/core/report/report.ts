import { comparisonPeriod, type ComparisonKind, type ReportPeriod } from "../period";
import type { MainPrincipal, Perspective, Ride, WmsUnit } from "../types";
import { materializeRides } from "../wms/rides";
import { buildContext, type ReportOptions } from "./context";
import { computeDailyVolume, type DailyVolumeBlock } from "./daily";
import { computeInsights, type Insight } from "./insights";
import { computeOutbound, type OutboundBlock } from "./outbound";
import { computeFlow, computeProfiles, type FlowBlock, type PrincipalProfile } from "./profiles";
import { computeInboundStocked, computeOnTimeLoading, type PunctualityResult } from "./punctuality";
import { computeStock, type StockBlock } from "./stock";
import { computeStorage, computeStorageTop, type StorageBlock, type StorageTopBlock } from "./storage";
import {
  computeContainerMix,
  computeDestinations,
  computeVolume,
  type ContainerMixBlock,
  type DestinationsBlock,
  type VolumeBlock,
} from "./workload";

export interface PerspectiveBlocks {
  volume: VolumeBlock;
  containerMix: ContainerMixBlock;
  destinations: DestinationsBlock;
}

/** All operational KPIs for one period. Pure and serialisable. */
export interface OperationalReport {
  period: ReportPeriod;
  generatedAt: string;
  /** Both perspectives are always computed; the UI toggles between them. */
  perspectives: Record<Perspective, PerspectiveBlocks>;
  outbound: OutboundBlock;
  onTimeLoading: PunctualityResult;
  inboundStocked: PunctualityResult;
  dailyVolume: DailyVolumeBlock;
  storage: StorageBlock;
  storageTop: StorageTopBlock;
  stock: StockBlock;
  flow: FlowBlock;
  profiles: Record<MainPrincipal, PrincipalProfile>;
  insights: Insight[];
}

export function computeReport(
  units: readonly WmsUnit[],
  period: ReportPeriod,
  options: ReportOptions = {},
  rides?: readonly Ride[],
): OperationalReport {
  const ctx = buildContext(units, period, options, rides);
  const perspective = (p: Perspective): PerspectiveBlocks => ({
    volume: computeVolume(ctx, p),
    containerMix: computeContainerMix(ctx, p),
    destinations: computeDestinations(ctx, p),
  });
  const perspectives = { hus: perspective("hus"), rides: perspective("rides") };
  const outbound = computeOutbound(ctx);
  const storage = computeStorage(ctx);
  const stock = computeStock(ctx);
  const profiles = computeProfiles(ctx);

  return {
    period,
    generatedAt: new Date().toISOString(),
    perspectives,
    outbound,
    onTimeLoading: computeOnTimeLoading(ctx),
    inboundStocked: computeInboundStocked(ctx),
    dailyVolume: computeDailyVolume(ctx),
    storage,
    storageTop: computeStorageTop(ctx),
    stock,
    flow: computeFlow(ctx),
    profiles,
    insights: computeInsights(ctx, {
      volumeHus: perspectives.hus.volume,
      storage,
      profiles,
      stock,
      avgHusPerRide: outbound.avgHusPerRide,
    }),
  };
}

export interface ReportSet {
  current: OperationalReport;
  /** One full report per requested comparison, in the requested order. */
  comparisons: { kind: ComparisonKind; report: OperationalReport }[];
}

/**
 * Report for a period plus its comparison periods. Rides are materialised once
 * from all units, so a ride has the same canonical day in every report.
 * Only pass comparisons from availableComparisons(): this function does not
 * check coverage.
 */
export function computeReportSet(
  units: readonly WmsUnit[],
  period: ReportPeriod,
  comparisons: readonly ComparisonKind[],
  options: ReportOptions = {},
  rides?: readonly Ride[],
): ReportSet {
  const allRides = rides ?? materializeRides(units).rides;
  return {
    current: computeReport(units, period, options, allRides),
    comparisons: comparisons.map((kind) => ({
      kind,
      report: computeReport(units, comparisonPeriod(period, kind), options, allRides),
    })),
  };
}
