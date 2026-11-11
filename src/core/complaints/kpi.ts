import { TARGETS } from "../constants";
import { sortPeriods } from "../dates";
import type { Direction, MainPrincipal, Period, Ride, Shipment } from "../types";
import { MAIN_PRINCIPALS } from "../types";
import { NOT_CATEGORIZED, type ComplaintMeta, type ComplaintView } from "./types";

/**
 * Complaint KPIs: share of rides / shipments / HUs WITHOUT a complaint.
 *
 *   pct = (total − affected) / total × 100      (null when total = 0)
 *
 * Only complaints that are linked (matched, shipment or ride level), included
 * in the KPI and whose ride is not excluded from the report count.
 */

export interface LevelResult {
  total: number;
  affected: number;
  /** Complaint-free percentage, unrounded. Null when there is no denominator. */
  pct: number | null;
  target: number;
  meetsTarget: boolean | null;
}

export interface DirectionKpi {
  rides: LevelResult;
  shipments: LevelResult & {
    /** Ride-level complaints that cannot be attributed to one shipment. */
    unassignable: number;
  };
  hus: LevelResult;
  /** Linked, included complaints (not the same as affected entities). */
  complaintCount: number;
  excluded: { count: number; byReason: Record<string, number> };
  ambiguous: number;
  /** Unmatched / out-of-scope complaints with this or no direction, by incident month. */
  unlinked: number;
  deviations: { deviation: string; complaints: number; hus: number }[];
  perPeriod: { period: Period; rides: LevelResult; shipments: LevelResult; hus: LevelResult }[];
  perPrincipal: Record<MainPrincipal, { rides: LevelResult; shipments: LevelResult; hus: LevelResult }>;
}

export interface ComplaintKpiBlock {
  periods: Period[];
  inbound: Record<ComplaintView, DirectionKpi>;
  outbound: Record<ComplaintView, DirectionKpi>;
  warehouse: { total: number; perPeriod: Record<Period, number> };
}

/** Meta plus the incident month of the complaint (used for unlinked and warehouse counts). */
export type KpiComplaint = ComplaintMeta & { incidentPeriod: Period | null };

export interface ComplaintKpiInput {
  rides: readonly Ride[];
  shipments: readonly Shipment[];
  complaints: readonly KpiComplaint[];
  periods: Iterable<Period>;
}

function level(total: number, affected: number): LevelResult {
  const a = Math.min(affected, total);
  return {
    total,
    affected: a,
    pct: total > 0 ? ((total - a) / total) * 100 : null,
    target: TARGETS.complaintFreePct,
    meetsTarget: total > 0 ? (total - a) / total >= TARGETS.complaintFreePct / 100 : null,
  };
}

const VIEWS: ComplaintView[] = ["total", "sales", "vendor"];

export function computeComplaintKpi(input: ComplaintKpiInput): ComplaintKpiBlock {
  const periods = sortPeriods(input.periods);
  const selected = new Set(periods);
  return {
    periods,
    inbound: Object.fromEntries(VIEWS.map((v) => [v, direction(input, selected, "inbound", v)])) as Record<ComplaintView, DirectionKpi>,
    outbound: Object.fromEntries(VIEWS.map((v) => [v, direction(input, selected, "outbound", v)])) as Record<ComplaintView, DirectionKpi>,
    warehouse: warehouse(input.complaints, selected),
  };
}

function warehouse(complaints: readonly KpiComplaint[], selected: Set<Period>) {
  const perPeriod: Record<Period, number> = {};
  let total = 0;
  for (const c of complaints) {
    if (c.direction !== "warehouse" || !c.includeInKpi || !c.incidentPeriod || !selected.has(c.incidentPeriod)) continue;
    perPeriod[c.incidentPeriod] = (perPeriod[c.incidentPeriod] ?? 0) + 1;
    total++;
  }
  return { total, perPeriod };
}

function direction(input: ComplaintKpiInput, selected: Set<Period>, dir: Direction, view: ComplaintView): DirectionKpi {
  const rides = new Map<string, Ride>();
  for (const r of input.rides) {
    if (r.direction === dir && selected.has(r.period) && !r.excludedFromReport) rides.set(r.ritNummer, r);
  }
  const shipments = new Map<string, Shipment>();
  for (const s of input.shipments) {
    if (s.direction === dir && rides.has(s.ritNummer)) shipments.set(s.dossiernummer, s);
  }

  const inView = (c: KpiComplaint) => view === "total" || c.salesVendor === view;

  // Resolve each linked complaint to its ride (and shipment).
  type Linked = { c: KpiComplaint; ride: Ride; shipment: Shipment | null };
  const linked: Linked[] = [];
  const excludedByReason: Record<string, number> = {};
  let excluded = 0;
  let ambiguous = 0;
  let unlinked = 0;
  for (const c of input.complaints) {
    if (!inView(c)) continue;
    const inSelection = (c.direction === dir || c.direction === null) && !!c.incidentPeriod && selected.has(c.incidentPeriod);
    if (c.matchStatus === "unmatched" || c.matchStatus === "out_of_scope") {
      if (inSelection) unlinked++;
      continue;
    }
    if (c.matchStatus === "ambiguous") {
      // Ambiguous complaints have no direction yet; they show up in both directions until resolved.
      if (inSelection) ambiguous++;
      continue;
    }
    if (c.direction !== dir) continue;
    const shipment = c.linkLevel === "shipment" && c.dossiernummer ? (shipments.get(c.dossiernummer) ?? null) : null;
    const ride = rides.get(shipment?.ritNummer ?? c.ritNummer ?? "");
    if (!ride) continue; // other period, excluded ride or not in WMS
    if (c.linkLevel === "shipment" && !shipment) continue;
    if (!c.includeInKpi) {
      excluded++;
      const reason = c.exclusionReason ?? "(geen reden)";
      excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1;
      continue;
    }
    linked.push({ c, ride, shipment });
  }

  const measure = (items: Linked[], rideSet: Ride[], shipmentSet: Shipment[], rideHuCap: (r: Ride) => number) => {
    const affectedRides = new Set(items.map((x) => x.ride.ritNummer));
    const affectedShipments = new Set(items.filter((x) => x.shipment).map((x) => x.shipment!.dossiernummer));

    // HUs: cap per shipment, then cap per ride (shipment-level + ride-level complaints together).
    const perShipment = new Map<string, number>();
    const rideLevel = new Map<string, number>();
    for (const x of items) {
      const n = x.c.huAffected ?? 1;
      if (x.shipment) perShipment.set(x.shipment.dossiernummer, (perShipment.get(x.shipment.dossiernummer) ?? 0) + n);
      else rideLevel.set(x.ride.ritNummer, (rideLevel.get(x.ride.ritNummer) ?? 0) + n);
    }
    const perRide = new Map<string, number>();
    for (const [dossier, n] of perShipment) {
      const s = shipments.get(dossier)!;
      perRide.set(s.ritNummer, (perRide.get(s.ritNummer) ?? 0) + Math.min(n, s.huCount));
    }
    for (const [rit, n] of rideLevel) perRide.set(rit, (perRide.get(rit) ?? 0) + n);
    let affectedHus = 0;
    for (const [rit, n] of perRide) affectedHus += Math.min(n, rideHuCap(rides.get(rit)!));

    return {
      rides: level(rideSet.length, affectedRides.size),
      shipments: level(shipmentSet.length, affectedShipments.size),
      hus: level(
        rideSet.reduce((a, r) => a + rideHuCap(r), 0),
        affectedHus,
      ),
      unassignable: items.filter((x) => !x.shipment).length,
    };
  };

  const allRides = [...rides.values()];
  const allShipments = [...shipments.values()];
  const totals = measure(linked, allRides, allShipments, (r) => r.huCount);

  const perPeriod = [...selected].sort().map((period) => {
    const m = measure(
      linked.filter((x) => x.ride.period === period),
      allRides.filter((r) => r.period === period),
      allShipments.filter((s) => s.period === period),
      (r) => r.huCount,
    );
    return { period, rides: m.rides, shipments: m.shipments, hus: m.hus };
  });

  const perPrincipal = Object.fromEntries(
    MAIN_PRINCIPALS.map((p) => {
      const m = measure(
        linked.filter((x) => x.c.principal === p),
        allRides.filter((r) => r.principals.includes(p)),
        allShipments.filter((s) => s.principal === p),
        (r) => r.huByPrincipal[p] ?? 0,
      );
      return [p, { rides: m.rides, shipments: m.shipments, hus: m.hus }];
    }),
  ) as DirectionKpi["perPrincipal"];

  const devs = new Map<string, { complaints: number; hus: number }>();
  for (const x of linked) {
    const k = x.c.deviation ?? NOT_CATEGORIZED;
    const e = devs.get(k) ?? { complaints: 0, hus: 0 };
    e.complaints++;
    e.hus += x.c.huAffected ?? 1;
    devs.set(k, e);
  }

  return {
    rides: totals.rides,
    shipments: { ...totals.shipments, unassignable: totals.unassignable },
    hus: totals.hus,
    complaintCount: linked.length,
    excluded: { count: excluded, byReason: excludedByReason },
    ambiguous,
    unlinked,
    deviations: [...devs]
      .map(([deviation, e]) => ({ deviation, ...e }))
      .sort((a, b) => b.complaints - a.complaints),
    perPeriod,
    perPrincipal,
  };
}
