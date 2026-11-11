import {
  CONTAINER_CODES,
  DEFAULT_OPDRACHTGEVER_MAP,
  EXCLUDED_STATUS_PREFIXES,
  EXCLUDED_STATUSES,
} from "../constants";
import { parseDateValue, periodOf, sortPeriods } from "../dates";
import type { Period, Principal, ShipmentType, StorageBucket, WmsUnit } from "../types";
import type { ParsedWms, RawWmsRow } from "./excel";

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

export function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

/** Ride ids: trimmed; empty and "0" mean "no ride". `12345.0` → `12345`. */
export function normalizeRide(v: unknown): string | null {
  let s = str(v);
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  if (s === "" || s === "0") return null;
  return s;
}

/** Numbers that may arrive as Dutch-formatted text ("1.234,5"). */
export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s/g, "");
  if (s === "") return null;
  if (s.includes(",") && s.includes(".")) {
    // Whichever separator comes last is the decimal separator.
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizeOpdrachtgever(v: unknown): string {
  return str(v).toLowerCase().replace(/\s+/g, " ");
}

export function normalizeStatus(omschrijving: string): string {
  return omschrijving.trim().toLowerCase();
}

export function isExcludedStatus(omschrijving: string): boolean {
  const s = normalizeStatus(omschrijving);
  return (
    (EXCLUDED_STATUSES as readonly string[]).includes(s) ||
    EXCLUDED_STATUS_PREFIXES.some((p) => s.startsWith(p))
  );
}

export function storageBucket(days: number): StorageBucket {
  if (days <= 7) return "0-7";
  if (days <= 14) return "8-14";
  if (days <= 30) return "15-30";
  if (days <= 60) return "31-60";
  return ">60";
}

const alnumUpper = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Extra 20-foot recognition on free text (container type and seal fields). */
const TWENTY_FOOT_RE = /(?:^|[^0-9])(?:20\s*(?:'|ft|foot|feet|gp|dv|dc|std)|2[24]G[01])(?![0-9a-z])/i;

/**
 * Classify shipment type. Order matters (first rule wins):
 * 40S codes → 40H codes → 20S codes → 20ft text pattern → seal LCL/AIR/FCA → Onbekend.
 */
export function classifyShipmentType(containertype: string, seals: readonly string[]): ShipmentType {
  const code = alnumUpper(containertype);
  for (const type of ["40S", "40H", "20S"] as const) {
    if ((CONTAINER_CODES[type] as readonly string[]).includes(code)) return type;
  }
  if ([containertype, ...seals].some((t) => TWENTY_FOOT_RE.test(t))) return "20S";
  const sealText = seals.join(" ").toLowerCase();
  if (sealText.includes("lcl")) return "LCL";
  if (sealText.includes("air")) return "AIR";
  if (sealText.includes("fca")) return "FCA";
  return "Onbekend";
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

export type RejectReason = "status" | "no-dates" | "negative-storage" | "invalid-weight";

export interface RejectedRow {
  rowIndex: number;
  reason: RejectReason;
  detail: string;
  /** Parsed dates and client of the rejected row, for reconciliation per period. */
  inslagUnit: Date | null;
  uitslagUnit: Date | null;
  opdrachtgever: string;
}

export interface EnrichValidation {
  rawCount: number;
  acceptedCount: number;
  rejected: RejectedRow[];
  /** Excluded statuses with counts (normalised description → count). */
  excludedStatuses: Record<string, number>;
  /** Unknown clients (as written in the file) → row count. They are mapped to "Overig". */
  unknownPrincipals: Record<string, number>;
  /** Accepted rows with a date cell that could not be parsed, per column. */
  unparseableDates: Record<string, number>;
  /** Optional columns missing from the file; the KPIs listed cannot be measured. */
  missingOptional: { column: string; affects: string[] }[];
}

export interface EnrichResult {
  units: WmsUnit[];
  validation: EnrichValidation;
  availablePeriods: Period[];
}

export interface EnrichOptions {
  opdrachtgeverMap?: Readonly<Record<string, Principal>>;
}

const DATE_COLUMNS = [
  ["Laaddatum", "laaddatum"],
  ["Inslag Unit", "inslagUnit"],
  ["Uitslag Unit", "uitslagUnit"],
  ["vertrek", "vertrek"],
  ["losdatum", "losdatum"],
] as const;

export function enrichWms(parsed: ParsedWms, options: EnrichOptions = {}): EnrichResult {
  const map = options.opdrachtgeverMap ?? DEFAULT_OPDRACHTGEVER_MAP;
  const units: WmsUnit[] = [];
  const validation: EnrichValidation = {
    rawCount: parsed.rows.length,
    acceptedCount: 0,
    rejected: [],
    excludedStatuses: {},
    unknownPrincipals: {},
    unparseableDates: {},
    missingOptional: [],
  };
  if (!parsed.optionalFound.vertrek) {
    validation.missingOptional.push({ column: "Vertrek", affects: ["On-time loading"] });
  }
  if (!parsed.optionalFound.losdatum) {
    validation.missingOptional.push({ column: "Losdatum", affects: ["Inbound stocked", "Daily units in (inbound)"] });
  }

  const periods = new Set<Period>();

  for (const row of parsed.rows) {
    const unit = enrichRow(row, map, validation);
    if (!unit) continue;
    units.push(unit);
    if (unit.inboundPeriod) periods.add(unit.inboundPeriod);
    if (unit.outboundPeriod) periods.add(unit.outboundPeriod);
  }
  validation.acceptedCount = units.length;
  return { units, validation, availablePeriods: sortPeriods(periods) };
}

function enrichRow(row: RawWmsRow, map: Readonly<Record<string, Principal>>, v: EnrichValidation): WmsUnit | null {
  const dates: Record<(typeof DATE_COLUMNS)[number][1], Date | null> = {
    laaddatum: null,
    inslagUnit: null,
    uitslagUnit: null,
    vertrek: null,
    losdatum: null,
  };
  const badDates: string[] = [];
  for (const [col, key] of DATE_COLUMNS) {
    const raw = row[col];
    const d = parseDateValue(raw);
    dates[key] = d;
    if (d === null && raw !== null && raw !== undefined && str(raw) !== "") badDates.push(col);
  }

  const opdrachtgever = str(row["Opdrachtgever"]);
  const reject = (reason: RejectReason, detail: string) => {
    v.rejected.push({
      rowIndex: row.__rowIndex,
      reason,
      detail,
      inslagUnit: dates.inslagUnit,
      uitslagUnit: dates.uitslagUnit,
      opdrachtgever,
    });
    return null;
  };

  const omschrijving = str(row["Omschrijving"]);
  if (isExcludedStatus(omschrijving)) {
    const s = normalizeStatus(omschrijving);
    v.excludedStatuses[s] = (v.excludedStatuses[s] ?? 0) + 1;
    return reject("status", omschrijving);
  }

  if (!dates.inslagUnit && !dates.uitslagUnit) return reject("no-dates", "Inslag en uitslag leeg");

  const dagenRaw = parseNumber(row["Dagen in opslag"]);
  if (dagenRaw !== null && dagenRaw < 0) return reject("negative-storage", String(dagenRaw));

  const brutoKg = parseNumber(row["Bruto kg"]) ?? 0;
  if (brutoKg <= 0) return reject("invalid-weight", String(row["Bruto kg"] ?? ""));

  for (const col of badDates) v.unparseableDates[col] = (v.unparseableDates[col] ?? 0) + 1;

  let principal = map[normalizeOpdrachtgever(opdrachtgever)];
  if (!principal) {
    const key = opdrachtgever || "(leeg)";
    v.unknownPrincipals[key] = (v.unknownPrincipals[key] ?? 0) + 1;
    principal = "Overig";
  }

  const containertype = str(row["Containertype"]);
  const seals: [string, string, string] = [
    str(row["Sealnummer 1"]),
    str(row["Sealnummer 2"]),
    str(row["Sealnummer 3"]),
  ];
  const losLand = str(row["Los land"]) || null;
  const afzenderLand = str(row["Afzender land"]) || null;

  return {
    rowIndex: row.__rowIndex,
    referentie: str(row["Referentie"]),
    dossiernummer: str(row["Dossiernummer"]),
    inkomendeRit: normalizeRide(row["Inkomende rit"]),
    uitgaandeRit: normalizeRide(row["Uitgaande rit"]),
    omschrijving,
    status: normalizeStatus(omschrijving) === "gelost" ? "gelost" : "geladen",
    opdrachtgever,
    principal,
    containertype,
    seals,
    shipmentType: dates.uitslagUnit ? classifyShipmentType(containertype, seals) : null,
    brutoKg,
    laaddatum: dates.laaddatum,
    vertrek: dates.vertrek,
    losdatum: dates.losdatum,
    inslagUnit: dates.inslagUnit,
    uitslagUnit: dates.uitslagUnit,
    losLand,
    afzenderLand,
    dagenInOpslag: dagenRaw,
    storageBucket: dagenRaw === null ? null : storageBucket(dagenRaw),
    inboundPeriod: dates.inslagUnit ? periodOf(dates.inslagUnit) : null,
    outboundPeriod: dates.uitslagUnit ? periodOf(dates.uitslagUnit) : null,
  };
}
