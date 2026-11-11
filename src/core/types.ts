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
  /** Pallet barcode (column "Extern"), empty when unknown. */
  sscc: string;
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

/** How a ride got its date: from the ride list (planned) or from the HU scans (5% rule). */
export type DateResolution = "planned" | "single" | "majority_5pct";

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
  /** Leading date: Verwachte datum from the ride list, else the 5% rule on scans. */
  canonicalDate: DayKey;
  /** Date from the HU scans (5% rule), kept for comparison with the planned date. */
  scanDate: DayKey;
  /** Units according to the ride list (null when the ride is not on a list). */
  plannedUnits: number | null;
  /**
   * Relation to the ride lists. `counted`: on a list and counted; `ignored`: on
   * a list but test/cancel/empty/not finished; `not-on-list`: lists were given
   * but this ride is not on them; `no-list`: no ride lists were given.
   * With ride lists only `counted` rides (and their HUs) are in the KPIs.
   */
  listStatus: "counted" | "ignored" | "not-on-list" | "no-list";
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
