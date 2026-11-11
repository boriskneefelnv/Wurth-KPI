/**
 * Shared domain types for the Würth KPI core.
 *
 * Date convention (see docs/BESLUITEN.md, B1): every Date in this module is a
 * "wall-clock" value. The calendar components the WMS shows (e.g. 03-04-2026
 * 14:00) are stored in the Date's UTC fields and read back with UTC getters.
 * No timezone conversion happens anywhere, so a day or month never shifts.
 */

export const PRINCIPALS = ["WIAG", "AWKG", "Liqui Moly", "Overig"] as const;
export type Principal = (typeof PRINCIPALS)[number];

/** Principals that get their own slides and per-principal breakdowns. */
export const MAIN_PRINCIPALS = ["WIAG", "AWKG", "Liqui Moly"] as const;
export type MainPrincipal = (typeof MAIN_PRINCIPALS)[number];

export const KNOWN_SHIPMENT_TYPES = ["40S", "40H", "20S", "LCL", "AIR", "FCA"] as const;
export type KnownShipmentType = (typeof KNOWN_SHIPMENT_TYPES)[number];
export type ShipmentType = KnownShipmentType | "Onbekend";

export type Direction = "inbound" | "outbound";

export const STORAGE_BUCKETS = ["0-7", "8-14", "15-30", "31-60", ">60"] as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

/** Calendar month as `YYYY-MM`. */
export type Period = string;
/** Calendar day as `YYYY-MM-DD`. */
export type DayKey = string;

/**
 * Workload perspective. `rides` is what the Lovable tool called "containers":
 * a distinct directional ride number (rit), not a physical container number.
 */
export type Perspective = "hus" | "rides";

/** One accepted WMS row (= one handling unit) after enrichment. */
export interface WmsUnit {
  /** 1-based row number in the source sheet (header row = 1). */
  rowIndex: number;
  referentie: string;
  dossiernummer: string;
  /** Normalised ride id; empty and "0" become null. */
  inkomendeRit: string | null;
  uitgaandeRit: string | null;
  omschrijving: string;
  status: "geladen" | "gelost";
  opdrachtgever: string;
  principal: Principal;
  containertype: string;
  seals: [string, string, string];
  /** Only set when the unit has an outbound date. */
  shipmentType: ShipmentType | null;
  brutoKg: number;
  laaddatum: Date | null;
  /** Planned departure (optional column). */
  vertrek: Date | null;
  /** Unloading date (optional column). */
  losdatum: Date | null;
  inslagUnit: Date | null;
  uitslagUnit: Date | null;
  losLand: string | null;
  afzenderLand: string | null;
  dagenInOpslag: number | null;
  storageBucket: StorageBucket | null;
  inboundPeriod: Period | null;
  outboundPeriod: Period | null;
}

export type DateResolution = "single" | "majority_5pct";

export interface RideDate {
  canonicalDate: DayKey;
  period: Period;
  resolution: DateResolution;
  /** Dated HUs whose day differs from the canonical day (older and newer). */
  outlierHuCount: number;
  /** Dated HUs on newer days that were skipped by the 5% rule. */
  skippedNewerHuCount: number;
}

export interface Ride {
  direction: Direction;
  ritNummer: string;
  canonicalDate: DayKey;
  period: Period;
  dateResolution: DateResolution;
  outlierHuCount: number;
  huCount: number;
  shipmentCount: number;
  principals: Principal[];
  huByPrincipal: Partial<Record<Principal, number>>;
  /** Set by users in the app; excluded rides drop out of complaint KPIs. */
  excludedFromReport?: boolean;
}

export interface Shipment {
  direction: Direction;
  dossiernummer: string;
  referentie: string | null;
  ritNummer: string;
  /** Period of the shipment's ride, so ride/shipment/HU denominators align. */
  period: Period;
  ownDate: DayKey | null;
  huCount: number;
  principal: Principal | null;
}
