import { REQUIRED_COLUMNS } from "../constants";
import type { SheetData } from "./excel";
import { detectRideListDirection } from "./rideLists";

export type ExportKind = "units" | "ride-list-outbound" | "ride-list-inbound";

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Recognise a WMS export by its columns (first 15 rows of each sheet). */
export function detectExport(sheets: readonly SheetData[]): ExportKind | null {
  for (const s of sheets) {
    for (const row of s.rows.slice(0, 15)) {
      const cells = (row ?? []).map(norm);
      if (cells.includes("ritnummer") && cells.includes("verwachte datum")) {
        const dir = detectRideListDirection(row.map((c) => String(c ?? "")));
        if (dir) return dir === "outbound" ? "ride-list-outbound" : "ride-list-inbound";
      }
      const required = REQUIRED_COLUMNS.map(norm);
      if (required.filter((c) => cells.includes(c)).length >= required.length - 2) return "units";
    }
  }
  return null;
}
