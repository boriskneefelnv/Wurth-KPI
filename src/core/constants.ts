import type { MainPrincipal, Principal } from "./types";

// ---------------------------------------------------------------------------
// WMS columns
// ---------------------------------------------------------------------------

export const REQUIRED_COLUMNS = [
  "Referentie",
  "Bruto kg",
  "Inkomende rit",
  "Uitgaande rit",
  "Dossiernummer",
  "Omschrijving",
  "Laaddatum",
  "Opdrachtgever",
  "Containertype",
  "Sealnummer 1",
  "Sealnummer 2",
  "Sealnummer 3",
  "Los land",
  "Afzender land",
  "Inslag Unit",
  "Uitslag Unit",
  "Dagen in opslag",
] as const;

/**
 * Optional columns. They are not required for parsing, but without them some
 * KPIs cannot be measured (validation reports this explicitly).
 */
export const OPTIONAL_COLUMN_ALIASES = {
  vertrek: ["Vertrek", "Vertrekdatum", "Geplande vertrek", "Planned departure"],
  losdatum: ["Losdatum", "Los datum", "Datum lossen"],
  /** SSCC / pallet barcode; used to remove exact duplicate rows. */
  sscc: ["Extern", "SSCC"],
} as const;

/** Preferred sheet name; otherwise single sheet; otherwise best header match. */
export const PREFERRED_SHEET_NAMES = ["WMS", "Data", "Export"];

// ---------------------------------------------------------------------------
// Row filtering
// ---------------------------------------------------------------------------

export const EXCLUDED_STATUSES = ["cancel", "aangepast", "verschil"] as const;
export const EXCLUDED_STATUS_PREFIXES = ["manual adjus"] as const;

// ---------------------------------------------------------------------------
// Principals
// ---------------------------------------------------------------------------

/**
 * Opdrachtgever (normalised: trimmed, lowercased, single spaces) → principal.
 *
 * Checked against the H1 2026 export: Liqui Moly GmbH, Adolf Würth GmbH & Co. KG,
 * Würth Logistics AG (= WIAG, confirmed).
 * Unknown clients map to "Overig" and are listed in validation.
 */
export const DEFAULT_OPDRACHTGEVER_MAP: Readonly<Record<string, Principal>> = {
  wiag: "WIAG",
  // Confirmed: Würth Logistics AG is WIAG.
  "würth logistics ag": "WIAG",
  "wurth logistics ag": "WIAG",
  "würth international ag": "WIAG",
  "wurth international ag": "WIAG",
  awkg: "AWKG",
  "adolf würth gmbh & co. kg": "AWKG",
  "adolf wurth gmbh & co. kg": "AWKG",
  "liqui moly": "Liqui Moly",
  "liqui moly gmbh": "Liqui Moly",
};

export const PRINCIPAL_COLORS: Readonly<Record<Principal, string>> = {
  WIAG: "#266B92",
  AWKG: "#349BD6",
  "Liqui Moly": "#5BB230",
  Overig: "#94A3B8",
};

export const PRINCIPAL_DISPLAY_ORDER: readonly MainPrincipal[] = ["WIAG", "AWKG", "Liqui Moly"];

export function principalSortKey(p: Principal): number {
  const i = (PRINCIPAL_DISPLAY_ORDER as readonly string[]).indexOf(p);
  return i === -1 ? 99 : i;
}

// ---------------------------------------------------------------------------
// Container / shipment types
// ---------------------------------------------------------------------------

/** Codes compared after uppercasing and stripping non-alphanumerics. */
export const CONTAINER_CODES = {
  "40S": ["40S", "42G0", "42G1", "40FT", "40FOOT", "40STD", "40DV", "40DC", "40GP"],
  "40H": ["40H", "45G0", "45G1", "40HC", "40HQ", "40HIGHCUBE", "40HIGHCUB", "40HICUBE"],
  "20S": ["20S", "22G0", "22G1", "24G1", "20FT", "20FOOT", "20STD", "20DV", "20DC", "20GP"],
} as const;

// ---------------------------------------------------------------------------
// KPI targets and thresholds
// ---------------------------------------------------------------------------

export const TARGETS = {
  onTimeLoadingPct: 95,
  inboundStockedPct: 95,
  /** Inbound counts as stocked on time when done within this many workdays after the unloading day. */
  inboundStockedGraceWorkdays: 1,
  complaintFreePct: 95,
} as const;

/** KPI-overview colouring for complaint-free percentages. */
export const STATUS_THRESHOLDS = { green: 95, amber: 90 } as const;

export const DESTINATIONS_TOP_N = 10;
export const SANKEY_TOP_COUNTRIES = 8;


/** Share of dated HUs (from the newest day backwards) that fixes a ride's canonical day. */
export const RIDE_DATE_THRESHOLD = 0.05;

// ---------------------------------------------------------------------------
// House style
// ---------------------------------------------------------------------------

export const TOKENS = {
  bluePrimary: "#266B92",
  blueDark: "#1A4D6B",
  blueLight: "#349BD6",
  bluePale: "#E2EBF4",
  canvas: "#DDE9F4",
  greenAccent: "#5BB230",
  greenLight: "#7BC142",
  textDark: "#1A1A2E",
  textSecondary: "#64748B",
  borderSubtle: "#CBD5E1",
  cardBg: "#FFFFFF",
  statusOk: "#5BB230",
  statusWarn: "#F4A93C",
  statusBad: "#E05B5B",
  wurthRed: "#CC0000",
} as const;
