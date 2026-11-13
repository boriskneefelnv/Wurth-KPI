import type { CountryKey } from "../report/countries";
import type { ReportPeriod } from "../period";
import type { ReportSet } from "../report/report";
import type { MainPrincipal } from "../types";
import { MAIN_PRINCIPALS } from "../types";
import { countryName } from "./format";

/**
 * View model for "Outbound destinations worldwide": rides and HUs per
 * destination country, per principal, for a world map with the top routes
 * from Rotterdam. Deck texts are English.
 */

export const TOP_ROUTES = 10;

export interface WorldCountry {
  country: string;
  name: string;
  rides: number;
  hus: number;
  /** Per principal (only in the all principals view). */
  perPrincipal: { principal: MainPrincipal; rides: number; hus: number }[] | null;
}

export interface WorldView {
  key: CountryKey;
  label: string;
  /** Countries with at least one HU or ride, most rides first. */
  countries: WorldCountry[];
  top: WorldCountry[];
  /** Outbound rides and HUs of this view in the period (a ride to two countries counts once). */
  rides: number;
  hus: number;
}

export interface WorldMapSlideModel {
  title: string;
  period: ReportPeriod;
  views: Record<CountryKey, WorldView>;
  order: CountryKey[];
}

const ORDER: CountryKey[] = ["Total", "WIAG", "AWKG", "Liqui Moly"];

export function worldMapSlide(set: ReportSet): WorldMapSlideModel {
  const rows = set.current.outboundCountries;
  const volume = set.current.perspectives;
  const views = Object.fromEntries(
    ORDER.map((key) => {
      const countries: WorldCountry[] = rows
        .map((r) => {
          const f = key === "Total" ? r.total : r.perPrincipal[key];
          return {
            country: r.country,
            name: countryName(r.country),
            rides: f.rides,
            hus: f.hus,
            perPrincipal: key === "Total" ? MAIN_PRINCIPALS.map((p) => ({ principal: p, ...r.perPrincipal[p] })).filter((p) => p.hus > 0 || p.rides > 0) : null,
          };
        })
        .filter((c) => c.rides > 0 || c.hus > 0)
        .sort((a, b) => b.rides - a.rides || b.hus - a.hus || a.name.localeCompare(b.name));
      const view: WorldView = {
        key,
        label: key === "Total" ? "All principals" : key,
        countries,
        top: countries.slice(0, TOP_ROUTES),
        rides: volume.rides.volume.outbound[key].total,
        hus: volume.hus.volume.outbound[key].total,
      };
      return [key, view];
    }),
  ) as Record<CountryKey, WorldView>;
  return { title: "Outbound destinations worldwide", period: set.current.period, views, order: ORDER };
}
