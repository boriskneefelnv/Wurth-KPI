import type { Principal, ShipmentType } from "../types";
import { PRINCIPALS } from "../types";
import { inc, selectedRides, type ReportContext } from "./context";

export interface CountryStats {
  country: string;
  /** Distinct outbound rides in the period delivering (partly) to this country. */
  rides: number;
  hus: number;
  kg: number;
  perPrincipal: Record<Principal, { rides: number; hus: number; kg: number }>;
  /** HU count per shipment type. */
  shipmentTypes: Partial<Record<ShipmentType, number>>;
}

export interface OutboundBlock {
  /** Outbound HUs whose outbound date falls in the period. */
  totalHus: number;
  totalKg: number;
  /** Outbound rides whose canonical day falls in the period. */
  rides: number;
  /** Average HUs per ride (all HUs of those rides). */
  avgHusPerRide: number | null;
  /** Sorted by rides desc, then HUs desc. */
  countries: CountryStats[];
}

export function computeOutbound(ctx: ReportContext): OutboundBlock {
  const emptyPer = () =>
    Object.fromEntries(PRINCIPALS.map((p) => [p, { rides: 0, hus: 0, kg: 0 }])) as CountryStats["perPrincipal"];
  const countries = new Map<string, CountryStats>();
  const country = (c: string) => {
    let s = countries.get(c);
    if (!s) countries.set(c, (s = { country: c, rides: 0, hus: 0, kg: 0, perPrincipal: emptyPer(), shipmentTypes: {} }));
    return s;
  };

  let totalHus = 0;
  let totalKg = 0;
  for (const u of ctx.units) {
    if (!ctx.inPeriod(u.uitslagUnit)) continue;
    totalHus++;
    totalKg += u.brutoKg;
    const c = country(u.losLand ?? "Onbekend");
    c.hus++;
    c.kg += u.brutoKg;
    c.perPrincipal[u.principal].hus++;
    c.perPrincipal[u.principal].kg += u.brutoKg;
    const t = u.shipmentType ?? "Onbekend";
    c.shipmentTypes[t] = (c.shipmentTypes[t] ?? 0) + 1;
  }

  const rides = selectedRides(ctx, "outbound");
  let rideHus = 0;
  for (const ride of rides) {
    rideHus += ride.huCount;
    const units = ctx.unitsByRide.outbound.get(ride.ritNummer) ?? [];
    const perCountry = new Map<string, Set<Principal>>();
    for (const u of units) {
      const c = u.losLand ?? "Onbekend";
      let s = perCountry.get(c);
      if (!s) perCountry.set(c, (s = new Set()));
      s.add(u.principal);
    }
    for (const [c, principals] of perCountry) {
      const stats = country(c);
      stats.rides++;
      for (const p of principals) stats.perPrincipal[p].rides++;
    }
  }

  return {
    totalHus,
    totalKg,
    rides: rides.length,
    avgHusPerRide: rides.length ? rideHus / rides.length : null,
    countries: [...countries.values()].sort((a, b) => b.rides - a.rides || b.hus - a.hus),
  };
}

/** HUs per country for a principal (used by profiles and insights). */
export function principalCountryHus(ctx: ReportContext, principal: Principal): Map<string, number> {
  const m = new Map<string, number>();
  for (const u of ctx.units) {
    if (u.principal !== principal || !ctx.inPeriod(u.uitslagUnit)) continue;
    inc(m, u.losLand ?? "Onbekend");
  }
  return m;
}
