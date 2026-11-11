import { DESTINATIONS_TOP_N } from "../constants";
import { dayKey } from "../dates";
import { bucketIndex, type TrendBucket } from "../period";
import { directionalDate } from "../wms/rides";
import type { DayKey, Direction, KnownShipmentType, Perspective, Principal, ShipmentType, WmsUnit } from "../types";
import { KNOWN_SHIPMENT_TYPES, PRINCIPALS } from "../types";
import { inc, selectedRides, type ReportContext } from "./context";

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

export type SeriesKey = Principal | "Total";

export interface VolumeSeries {
  /** Value per bucket (day, week or month, see VolumeBlock.buckets). */
  buckets: number[];
  total: number;
  /** Total / number of buckets (the period is fully covered, so empty buckets are real zeros). */
  avgPerBucket: number;
  /** Total / workdays in the period. */
  avgPerWorkday: number | null;
  /** Bucket with the highest value (first one on ties). */
  peak: { label: string; value: number } | null;
  /** Busiest single day. */
  peakDay: { day: DayKey; value: number } | null;
}

export interface VolumeBlock {
  perspective: Perspective;
  buckets: TrendBucket[];
  inbound: Record<SeriesKey, VolumeSeries>;
  outbound: Record<SeriesKey, VolumeSeries>;
}

function series(values: number[], perDay: Map<DayKey, number>, buckets: TrendBucket[], workdays: number): VolumeSeries {
  const total = values.reduce((a, b) => a + b, 0);
  let peak: VolumeSeries["peak"] = null;
  values.forEach((v, i) => {
    if (v > 0 && (!peak || v > peak.value)) peak = { label: buckets[i]!.label, value: v };
  });
  let peakDay: VolumeSeries["peakDay"] = null;
  for (const [day, value] of [...perDay].sort(([a], [b]) => a.localeCompare(b))) {
    if (!peakDay || value > peakDay.value) peakDay = { day, value };
  }
  return {
    buckets: values,
    total,
    avgPerBucket: buckets.length ? total / buckets.length : 0,
    avgPerWorkday: workdays > 0 ? total / workdays : null,
    peak,
    peakDay,
  };
}

const SERIES_KEYS: SeriesKey[] = [...PRINCIPALS, "Total"];

/**
 * Inbound/outbound volume per bucket and principal.
 * HUs: by Inslag Unit / Uitslag Unit. Rides: each ride once, on its canonical
 * day (5% rule); a ride with several principals counts for each of them, but
 * once in the total.
 */
export function computeVolume(ctx: ReportContext, perspective: Perspective): VolumeBlock {
  const { buckets } = ctx;

  const block = (direction: Direction): Record<SeriesKey, VolumeSeries> => {
    const values = Object.fromEntries(SERIES_KEYS.map((k) => [k, buckets.map(() => 0)])) as Record<SeriesKey, number[]>;
    const perDay = Object.fromEntries(SERIES_KEYS.map((k) => [k, new Map<DayKey, number>()])) as Record<
      SeriesKey,
      Map<DayKey, number>
    >;
    const add = (keys: SeriesKey[], day: DayKey) => {
      const i = bucketIndex(buckets, day);
      if (i === -1) return;
      for (const k of keys) {
        values[k][i]!++;
        inc(perDay[k], day);
      }
    };
    if (perspective === "hus") {
      for (const u of ctx.units) {
        const d = directionalDate(u, direction);
        if (d) add([u.principal, "Total"], dayKey(d));
      }
    } else {
      for (const ride of selectedRides(ctx, direction)) add([...ride.principals, "Total"], ride.canonicalDate);
    }
    return Object.fromEntries(
      SERIES_KEYS.map((k) => [k, series(values[k], perDay[k], buckets, ctx.workdays)]),
    ) as Record<SeriesKey, VolumeSeries>;
  };

  return { perspective, buckets, inbound: block("inbound"), outbound: block("outbound") };
}

// ---------------------------------------------------------------------------
// Container mix
// ---------------------------------------------------------------------------

export interface ContainerMix {
  total: number;
  counts: Record<ShipmentType, number>;
  /** Share 0–1 of total. */
  shares: Record<ShipmentType, number>;
}

const ALL_TYPES: ShipmentType[] = [...KNOWN_SHIPMENT_TYPES, "Onbekend"];

function emptyCounts(): Record<ShipmentType, number> {
  return Object.fromEntries(ALL_TYPES.map((t) => [t, 0])) as Record<ShipmentType, number>;
}

function finishMix(counts: Record<ShipmentType, number>): ContainerMix {
  const total = ALL_TYPES.reduce((a, t) => a + counts[t], 0);
  const shares = Object.fromEntries(ALL_TYPES.map((t) => [t, total ? counts[t] / total : 0])) as Record<ShipmentType, number>;
  return { total, counts, shares };
}

/** Most frequent known type among the units, else "Onbekend". */
export function dominantType(units: readonly WmsUnit[]): ShipmentType {
  const m = new Map<KnownShipmentType, number>();
  for (const u of units) if (u.shipmentType && u.shipmentType !== "Onbekend") inc(m, u.shipmentType);
  let best: ShipmentType = "Onbekend";
  let n = 0;
  for (const t of KNOWN_SHIPMENT_TYPES) {
    const c = m.get(t) ?? 0;
    if (c > n) {
      best = t;
      n = c;
    }
  }
  return best;
}

export interface ContainerMixBlock {
  perspective: Perspective;
  total: ContainerMix;
  perPrincipal: Record<Principal, ContainerMix>;
}

export function computeContainerMix(ctx: ReportContext, perspective: Perspective): ContainerMixBlock {
  const total = emptyCounts();
  const per = Object.fromEntries(PRINCIPALS.map((p) => [p, emptyCounts()])) as Record<Principal, Record<ShipmentType, number>>;

  if (perspective === "hus") {
    for (const u of ctx.units) {
      if (!ctx.inPeriod(u.uitslagUnit)) continue;
      const t = u.shipmentType ?? "Onbekend";
      total[t]++;
      per[u.principal][t]++;
    }
  } else {
    for (const ride of selectedRides(ctx, "outbound")) {
      const units = ctx.unitsByRide.outbound.get(ride.ritNummer) ?? [];
      total[dominantType(units)]++;
      for (const p of ride.principals) per[p][dominantType(units.filter((u) => u.principal === p))]++;
    }
  }
  return {
    perspective,
    total: finishMix(total),
    perPrincipal: Object.fromEntries(PRINCIPALS.map((p) => [p, finishMix(per[p])])) as Record<Principal, ContainerMix>,
  };
}

// ---------------------------------------------------------------------------
// Top destinations
// ---------------------------------------------------------------------------

export interface DestinationRow {
  country: string;
  total: number;
  perPrincipal: Record<Principal, number>;
}

export interface DestinationsBlock {
  perspective: Perspective;
  /** Top N countries, then an aggregated "Overig" row when there are more. */
  rows: DestinationRow[];
}

const emptyPer = () => Object.fromEntries(PRINCIPALS.map((p) => [p, 0])) as Record<Principal, number>;

/**
 * HU perspective: outbound HUs per country. Ride perspective: distinct rides
 * per country (a multi-drop ride counts in every country it delivers to).
 */
export function computeDestinations(ctx: ReportContext, perspective: Perspective): DestinationsBlock {
  const rows = new Map<string, DestinationRow>();
  const row = (country: string) => {
    let r = rows.get(country);
    if (!r) rows.set(country, (r = { country, total: 0, perPrincipal: emptyPer() }));
    return r;
  };

  if (perspective === "hus") {
    for (const u of ctx.units) {
      if (!ctx.inPeriod(u.uitslagUnit)) continue;
      const r = row(u.losLand ?? "Onbekend");
      r.total++;
      r.perPrincipal[u.principal]++;
    }
  } else {
    for (const ride of selectedRides(ctx, "outbound")) {
      const units = ctx.unitsByRide.outbound.get(ride.ritNummer) ?? [];
      const countries = new Map<string, Set<Principal>>();
      for (const u of units) {
        const c = u.losLand ?? "Onbekend";
        let s = countries.get(c);
        if (!s) countries.set(c, (s = new Set()));
        s.add(u.principal);
      }
      for (const [c, principals] of countries) {
        const r = row(c);
        r.total++;
        for (const p of principals) r.perPrincipal[p]++;
      }
    }
  }

  const sorted = [...rows.values()].sort((a, b) => b.total - a.total || a.country.localeCompare(b.country));
  const top = sorted.slice(0, DESTINATIONS_TOP_N);
  const rest = sorted.slice(DESTINATIONS_TOP_N);
  if (rest.length > 0) {
    const other: DestinationRow = { country: "Overig", total: 0, perPrincipal: emptyPer() };
    for (const r of rest) {
      other.total += r.total;
      for (const p of PRINCIPALS) other.perPrincipal[p] += r.perPrincipal[p];
    }
    top.push(other);
  }
  return { perspective, rows: top };
}
