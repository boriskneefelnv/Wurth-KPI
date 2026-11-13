import { dayKey, parseDateValue } from "../dates";
import type { DayKey, MainPrincipal } from "../types";
import type { SheetData } from "../wms/excel";

/**
 * Complaints export from the Neele-Vat complaints portal ("Klachten").
 * One row per complaint. Linked to WMS rides by the ride number in
 * "HD: Blujay dossier" or in the subject.
 */

export type ComplaintOrigin = "sales" | "vendor";
/** Accepted and denied as assessed in the portal; open = not assessed yet. */
export type ComplaintVerdict = "accepted" | "denied" | "open";
export type ComplaintCategory = "Damage" | "Stowing" | "Missing or not loaded" | "Dangerous goods and labels" | "Process and documents" | "Other";

export const COMPLAINT_CATEGORIES: readonly ComplaintCategory[] = ["Damage", "Stowing", "Missing or not loaded", "Dangerous goods and labels", "Process and documents", "Other"];

export interface PortalComplaint {
  klachtnr: number;
  incidentDay: DayKey | null;
  subject: string;
  principal: MainPrincipal | null;
  /** Sales: Würth's customer complains (goods received via Neele-Vat). Vendor: Würth itself complains. */
  origin: ComplaintOrigin | null;
  verdict: ComplaintVerdict;
  /** Affected pallets ("HD: Pallets"); null when not filled in. */
  pallets: number | null;
  /** Financial impact in euro ("HD: Financiële impact", else "Schadebedrag"). */
  amount: number | null;
  status: string;
  category: ComplaintCategory;
  /** Ride numbers found in the dossier field and the subject, best first. */
  rideTokens: string[];
}

/** Customer name in the portal → principal (confirmed by the user). */
export function principalFromCustomer(name: string): MainPrincipal | null {
  const n = name.toLowerCase();
  if (n.includes("liqui moly")) return "Liqui Moly";
  if (n.includes("adolf würth") || n.includes("adolf wurth") || n.includes("bremen")) return "AWKG";
  if (n.includes("würth logistics") || n.includes("wurth logistics")) return "WIAG";
  return null;
}

/** First match wins; the order matters (a battery complaint about damage is a dangerous goods complaint). */
const CATEGORY_RULES: [ComplaintCategory, RegExp][] = [
  ["Dangerous goods and labels", /batterij|lithium|label|\badr\b|\blq\b|gevaarlijk|dangerous/i],
  ["Stowing", /gestuwd|stuwing|stuwen|ladingzekering/i],
  ["Damage", /schade|beschadig|kapot|gebroken|lekk|damage/i],
  ["Missing or not loaded", /\bmist\b|niet geladen|vergeten|kwijt|ontbreek|manco|tekort|verkeerde goederen/i],
  ["Process and documents", /looplijst|geboekt|boeking|fyco|document|papieren|communicatie/i],
];

export function categorize(subject: string): ComplaintCategory {
  for (const [c, re] of CATEGORY_RULES) if (re.test(subject)) return c;
  return "Other";
}

const RIDE_RE = /2665\d{8}/g;
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** True when the sheets look like the complaints portal export. */
export function isComplaintsExport(sheets: readonly SheetData[]): boolean {
  const head = (sheets[0]?.rows[0] ?? []).map(norm);
  return head.includes("klachtnr") && head.includes("datum incident") && head.includes("onderwerp");
}

export function parseComplaints(sheets: readonly SheetData[]): PortalComplaint[] {
  const sheet = sheets.find((s) => (s.rows[0] ?? []).map(norm).includes("klachtnr"));
  if (!sheet) return [];
  const head = sheet.rows[0]!.map(norm);
  const col = (name: string) => head.indexOf(name.toLowerCase());
  const get = (r: unknown[], name: string) => (col(name) >= 0 ? r[col(name)] : undefined);
  const out: PortalComplaint[] = [];
  for (const r of sheet.rows.slice(1)) {
    const klachtnr = num(get(r, "Klachtnr"));
    if (klachtnr === null) continue;
    const subject = String(get(r, "Onderwerp") ?? "").trim();
    const date = parseDateValue(get(r, "Datum incident"));
    const sv = norm(get(r, "HD: Sales/Vendor"));
    const ad = norm(get(r, "HD: Accepted/Denied"));
    const dossier = String(get(r, "HD: Blujay dossier") ?? "");
    const tokens = [...new Set([...(dossier.match(RIDE_RE) ?? []), ...(subject.match(RIDE_RE) ?? [])])];
    const impact = num(get(r, "HD: Financiële impact"));
    out.push({
      klachtnr,
      incidentDay: date ? dayKey(date) : null,
      subject,
      principal: principalFromCustomer(String(get(r, "Klantnaam AFAS") ?? "")),
      origin: sv === "sales" ? "sales" : sv === "vendor" ? "vendor" : null,
      verdict: ad === "accepted" ? "accepted" : ad === "denied" ? "denied" : "open",
      pallets: num(get(r, "HD: Pallets")),
      amount: impact && impact > 0 ? impact : num(get(r, "Schadebedrag")),
      status: String(get(r, "Status AFAS") ?? "").trim(),
      category: categorize(subject),
      rideTokens: tokens,
    });
  }
  return out;
}
