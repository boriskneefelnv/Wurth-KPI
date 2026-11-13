import type { ReportPeriod } from "../period";
import { deltaPct } from "../report/context";
import type { ReportSet } from "../report/report";
import type { ContainerMixBlock } from "../report/workload";
import type { MainPrincipal, ShipmentType } from "../types";
import { KNOWN_SHIPMENT_TYPES, MAIN_PRINCIPALS } from "../types";

/**
 * View model for the container mix: outbound rides (containers) per container
 * type, for all principals (split by the ride's main principal) or one
 * principal. Deck texts are English.
 */

export type MixKey = MainPrincipal | "Total";

export const TYPE_LABEL: Record<ShipmentType, string> = {
  "40S": "40ft standard",
  "40H": "40ft high cube",
  "20S": "20ft standard",
  LCL: "LCL, part load",
  AIR: "Air freight",
  FCA: "FCA",
  RET: "Return to principal",
  Onbekend: "Type not recorded",
};

const ALL: ShipmentType[] = [...KNOWN_SHIPMENT_TYPES, "Onbekend"];

export interface MixRow {
  type: ShipmentType;
  code: string;
  label: string;
  rides: number;
  /** Share of the rides of this view, in %. */
  share: number;
  /** Rides of this type in the comparison period. */
  ghost: number | null;
  /** All principals view: rides per main principal (adds up to `rides`, "Other" included). */
  parts: { principal: MainPrincipal | "Other"; rides: number }[] | null;
}

export interface MixView {
  key: MixKey;
  label: string;
  rides: number;
  ridesDeltaPct: number | null;
  /** Outbound HUs per container (ride), on average. */
  husPerContainer: number | null;
  /** Shares in %: full containers (20/40ft), LCL, and everything else. */
  fullShare: number | null;
  lclShare: number | null;
  otherShare: number | null;
  rows: MixRow[];
}

export interface MixSlideModel {
  title: string;
  period: ReportPeriod;
  comparisonLabel: string | null;
  ghostLabel: string | null;
  views: Record<MixKey, MixView>;
  order: MixKey[];
}

const ORDER: MixKey[] = ["Total", "WIAG", "AWKG", "Liqui Moly"];

const countsOf = (b: ContainerMixBlock, key: MixKey) => (key === "Total" ? b.total.counts : b.perPrincipal[key].counts);

export function containerMixSlide(set: ReportSet): MixSlideModel {
  const cur = set.current.perspectives.rides.containerMix;
  const primary = set.comparisons.find((c) => c.kind === "lastYear") ?? set.comparisons.find((c) => c.kind === "previous") ?? null;
  const prev = primary ? primary.report.perspectives.rides.containerMix : null;

  const views = Object.fromEntries(
    ORDER.map((key) => {
      const counts = countsOf(cur, key);
      const pc = prev ? countsOf(prev, key) : null;
      const rides = ALL.reduce((a, t) => a + counts[t], 0);
      const prevRides = pc ? ALL.reduce((a, t) => a + pc[t], 0) : 0;
      const share = (n: number) => (rides ? (n / rides) * 100 : null);
      const rows: MixRow[] = ALL.map((t) => ({
        type: t,
        code: t === "Onbekend" ? "?" : t,
        label: TYPE_LABEL[t],
        rides: counts[t],
        share: rides ? (counts[t] / rides) * 100 : 0,
        ghost: pc && prevRides > 0 ? pc[t] : null,
        parts:
          key === "Total" && cur.totalByPrincipal
            ? [
                ...MAIN_PRINCIPALS.map((p) => ({ principal: p, rides: cur.totalByPrincipal![p][t] })),
                { principal: "Other" as const, rides: cur.totalByPrincipal.Overig[t] },
              ].filter((x) => x.rides > 0)
            : null,
      })).filter((r) => r.rides > 0 || (r.ghost ?? 0) > 0);
      const view: MixView = {
        key,
        label: key === "Total" ? "All principals" : key,
        rides,
        ridesDeltaPct: prevRides > 0 ? deltaPct(rides, prevRides) : null,
        husPerContainer: rides ? set.current.perspectives.hus.volume.outbound[key].total / rides : null,
        fullShare: share(counts["40S"] + counts["40H"] + counts["20S"]),
        lclShare: share(counts.LCL),
        otherShare: share(counts.AIR + counts.FCA + counts.RET + counts.Onbekend),
        rows,
      };
      return [key, view];
    }),
  ) as Record<MixKey, MixView>;

  return {
    title: "Container mix",
    period: set.current.period,
    comparisonLabel: primary ? `vs ${primary.report.period.label}` : null,
    ghostLabel: primary ? primary.report.period.label : null,
    views,
    order: ORDER,
  };
}
