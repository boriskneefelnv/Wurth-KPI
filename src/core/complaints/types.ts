import type { Direction, Period, Principal } from "../types";

export type ComplaintDirection = Direction | "warehouse";
export type DirectionSource = "auto_shipment" | "auto_ride" | "auto_keyword" | "manual";
export type MatchStatus = "matched_auto" | "matched_manual" | "ambiguous" | "unmatched" | "out_of_scope";
export type MatchSource = "afas_nv_dossiernummer" | "hd_blujay_dossier" | "regex_text" | "manual";
export type LinkLevel = "shipment" | "ride" | "none";
export type HuAffectedSource = "default_1" | "hd_pallets" | "hd_orderlines" | "manual";
export type SalesVendor = "sales" | "vendor";
export type Deviation = "Damage" | "Wrong quantity" | "Communication error" | "Stowing";
export type ComplaintView = "total" | "sales" | "vendor";

export const DEVIATIONS: readonly Deviation[] = ["Damage", "Wrong quantity", "Communication error", "Stowing"];
export const NOT_CATEGORIZED = "Not categorized";

/** Complaint as delivered by the AFAS / helpdesk source. */
export interface Complaint {
  klachtnr: number;
  datumIncident: Date | null;
  subject: string | null;
  reference: string | null;
  description: string | null;
  complaintType: string | null;
  /** Raw Neele-Vat dossier string from AFAS. */
  nvDossiernummer: string | null;
  /** Normalised dossier numbers from AFAS. */
  nvDossiernummers: string[];
  /** Historical helpdesk (BlueJay) dossier. */
  hdBlujayDossier: string | null;
  salesVendor?: SalesVendor | null;
}

export interface MatchCandidate {
  source: Exclude<MatchSource, "manual">;
  token: string;
  hit: "shipment" | "ride" | null;
  direction?: Direction;
}

/** Classification of one complaint for the Würth KPIs (table wurth_complaint_meta). */
export interface ComplaintMeta {
  klachtnr: number;
  direction: ComplaintDirection | null;
  directionSource: DirectionSource | null;
  directionReason: string | null;
  includeInKpi: boolean;
  exclusionReason: string | null;
  dossiernummer: string | null;
  ritNummer: string | null;
  linkLevel: LinkLevel;
  matchStatus: MatchStatus;
  matchSource: MatchSource | null;
  matchCandidates: MatchCandidate[];
  huAffected: number | null;
  huAffectedSource: HuAffectedSource | null;
  principal: Principal | null;
  /** Period of the linked ride/shipment. */
  period: Period | null;
  salesVendor: SalesVendor | null;
  salesVendorSource: "afas" | "manual" | null;
  deviation: Deviation | null;
  deviationSource: "auto" | "manual" | null;
  notes: string | null;
}
