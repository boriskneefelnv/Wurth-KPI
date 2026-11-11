import type { Complaint, Deviation } from "./types";

/**
 * Keyword lists. Matching is case-insensitive on whole words / phrases in
 * subject, reference, description and complaint type.
 * TODO(verify): tune against a real AFAS export.
 */
export const WAREHOUSE_KEYWORDS = ["label", "gelabeld", "labels", "batterij", "batterijen", "warehouse", "opslag", "wh"];

/** Evaluated in this order; first match wins. */
export const DEVIATION_KEYWORDS: readonly [Deviation, readonly string[]][] = [
  ["Damage", ["schade", "beschadigd", "beschadiging", "kapot", "gebroken", "deuk", "lekkage", "lek", "damage", "damaged", "broken", "leaking"]],
  [
    "Wrong quantity",
    ["manco", "tekort", "teveel", "te veel", "overschot", "ontbreekt", "ontbrekend", "verkeerd aantal", "aantal", "missing", "shortage", "surplus", "wrong quantity", "quantity"],
  ],
  ["Stowing", ["stuwing", "stuwen", "gestuwd", "belading", "ladingzekering", "verschoven", "omgevallen", "stowing", "stowage", "load securing"]],
  ["Communication error", ["communicatie", "niet doorgegeven", "niet geïnformeerd", "niet geinformeerd", "informatie", "communication", "not informed", "miscommunication"]],
];

function complaintText(c: Pick<Complaint, "subject" | "reference" | "description" | "complaintType">): string {
  return [c.subject, c.reference, c.description, c.complaintType].filter(Boolean).join(" \n ").toLowerCase();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (kw: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(kw).replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}])`, "iu");
const compiled = new Map<string, RegExp>();
function has(text: string, kw: string): boolean {
  let re = compiled.get(kw);
  if (!re) compiled.set(kw, (re = wordRe(kw)));
  return re.test(text);
}

export function findWarehouseKeyword(c: Complaint): string | null {
  const text = complaintText(c);
  return WAREHOUSE_KEYWORDS.find((kw) => has(text, kw)) ?? null;
}

export function classifyDeviation(c: Complaint): Deviation | null {
  const text = complaintText(c);
  for (const [deviation, keywords] of DEVIATION_KEYWORDS) {
    if (keywords.some((kw) => has(text, kw))) return deviation;
  }
  return null;
}

export const DEVIATION_COLORS: Record<Deviation | "Not categorized", string> = {
  Damage: "#C0392B",
  "Wrong quantity": "#E08A1E",
  "Communication error": "#266B92",
  Stowing: "#5BB230",
  "Not categorized": "#94A3B8",
};
