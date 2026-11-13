import type { MainPrincipal } from "../types";
import { MAIN_PRINCIPALS } from "../types";
import { selectedRides, type ReportContext } from "./context";

export type CountryKey = MainPrincipal | "Total";

export interface CountryFigures {
  rides: number;
  hus: number;
}

export interface OutboundCountry {
  /** ISO code from "Los land". */
  country: string;
  total: CountryFigures;
  perPrincipal: Record<MainPrincipal, CountryFigures>;
}

/**
 * Outbound rides and HUs per destination country (all countries, most HUs
 * first). HUs: those that left in the period (on the day of their ride, as in
 * volume). Rides: a ride counts once for every country it delivers to, and
 * for a principal when it carries HUs of that principal to that country.
 */
export function computeOutboundCountries(ctx: ReportContext): OutboundCountry[] {
  const rows = new Map<string, OutboundCountry>();
  const row = (c: string) => {
    let r = rows.get(c);
    if (!r) {
      r = { country: c, total: { rides: 0, hus: 0 }, perPrincipal: Object.fromEntries(MAIN_PRINCIPALS.map((p) => [p, { rides: 0, hus: 0 }])) as Record<MainPrincipal, CountryFigures> };
      rows.set(c, r);
    }
    return r;
  };
  const isMain = (p: string): p is MainPrincipal => (MAIN_PRINCIPALS as readonly string[]).includes(p);

  for (const u of ctx.units) {
    if (!u.losLand || !ctx.unitInPeriod(u, "outbound")) continue;
    const r = row(u.losLand);
    r.total.hus++;
    if (isMain(u.principal)) r.perPrincipal[u.principal].hus++;
  }
  for (const ride of selectedRides(ctx, "outbound")) {
    const perCountry = new Map<string, Set<string>>();
    for (const u of ctx.unitsByRide.outbound.get(ride.ritNummer) ?? []) {
      if (!u.losLand) continue;
      let s = perCountry.get(u.losLand);
      if (!s) perCountry.set(u.losLand, (s = new Set()));
      s.add(u.principal);
    }
    for (const [c, principals] of perCountry) {
      const r = row(c);
      r.total.rides++;
      for (const p of principals) if (isMain(p)) r.perPrincipal[p].rides++;
    }
  }
  return [...rows.values()].sort((a, b) => b.total.hus - a.total.hus || a.country.localeCompare(b.country));
}
