import { OPTIONAL_COLUMN_ALIASES, PREFERRED_SHEET_NAMES, REQUIRED_COLUMNS } from "../constants";

/** Library-independent workbook representation (see ./xlsxReader.ts). */
export interface SheetData {
  name: string;
  /** Raw cell values, row-major. Row 0 is sheet row 1. */
  rows: unknown[][];
}

export type SheetMatchReason = "exact-name" | "single-sheet" | "header-match";

/** A data row keyed by canonical column name. */
export interface RawWmsRow {
  /** 1-based sheet row number, for diagnostics. */
  __rowIndex: number;
  [column: string]: unknown;
}

export interface ParsedWms {
  rows: RawWmsRow[];
  /** Headers as they appear in the file. */
  headers: string[];
  sheetName: string;
  sheetMatchReason: SheetMatchReason;
  /** 1-based row number of the header row. */
  headerRow: number;
  missingRequired: string[];
  /** Optional columns that were found, by canonical name. */
  optionalFound: { vertrek: string | null; losdatum: string | null; sscc: string | null };
}

export class WmsParseError extends Error {
  constructor(
    message: string,
    readonly missingColumns: string[] = [],
  ) {
    super(message);
    this.name = "WmsParseError";
  }
}

const norm = (h: unknown) =>
  String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const REQUIRED_NORM = REQUIRED_COLUMNS.map(norm);

/** How many rows from the top are scanned for the header row. */
const HEADER_SCAN_ROWS = 15;

function findHeaderRow(sheet: SheetData): { index: number; score: number } {
  let best = { index: 0, score: -1 };
  const limit = Math.min(sheet.rows.length, HEADER_SCAN_ROWS);
  for (let i = 0; i < limit; i++) {
    const cells = new Set((sheet.rows[i] ?? []).map(norm));
    const score = REQUIRED_NORM.filter((h) => cells.has(h)).length;
    if (score > best.score) best = { index: i, score };
  }
  return best;
}

export function selectSheet(sheets: SheetData[]): { sheet: SheetData; reason: SheetMatchReason } {
  if (sheets.length === 0) throw new WmsParseError("Het bestand bevat geen werkbladen.");
  const preferred = PREFERRED_SHEET_NAMES.map(norm);
  const exact = sheets.find((s) => preferred.includes(norm(s.name)) && findHeaderRow(s).score > 0);
  if (exact) return { sheet: exact, reason: "exact-name" };
  if (sheets.length === 1) return { sheet: sheets[0]!, reason: "single-sheet" };
  let best = sheets[0]!;
  let bestScore = -1;
  for (const s of sheets) {
    const { score } = findHeaderRow(s);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return { sheet: best, reason: "header-match" };
}

function isEmptyCell(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/**
 * Turn a workbook into raw WMS rows keyed by canonical column names.
 * Throws WmsParseError when required columns are missing.
 */
export function parseWmsSheets(sheets: SheetData[]): ParsedWms {
  const { sheet, reason } = selectSheet(sheets);
  const { index: headerIdx } = findHeaderRow(sheet);
  const headerCells = (sheet.rows[headerIdx] ?? []).map((h) => String(h ?? "").trim());
  const headerNorm = headerCells.map(norm);

  // canonical name -> column index
  const colIndex = new Map<string, number>();
  REQUIRED_COLUMNS.forEach((name, i) => {
    const idx = headerNorm.indexOf(REQUIRED_NORM[i]!);
    if (idx !== -1) colIndex.set(name, idx);
  });
  const missingRequired = REQUIRED_COLUMNS.filter((c) => !colIndex.has(c));
  if (missingRequired.length > 0) {
    throw new WmsParseError(
      `Werkblad "${sheet.name}" mist verplichte kolommen: ${missingRequired.join(", ")}`,
      missingRequired,
    );
  }

  const optionalFound: ParsedWms["optionalFound"] = { vertrek: null, losdatum: null, sscc: null };
  for (const key of ["vertrek", "losdatum", "sscc"] as const) {
    for (const alias of OPTIONAL_COLUMN_ALIASES[key]) {
      const idx = headerNorm.indexOf(norm(alias));
      if (idx !== -1) {
        colIndex.set(key, idx);
        optionalFound[key] = headerCells[idx]!;
        break;
      }
    }
  }

  const rows: RawWmsRow[] = [];
  for (let r = headerIdx + 1; r < sheet.rows.length; r++) {
    const cells = sheet.rows[r] ?? [];
    if (cells.every(isEmptyCell)) continue;
    const row: RawWmsRow = { __rowIndex: r + 1 };
    for (const [name, idx] of colIndex) row[name] = cells[idx] ?? null;
    rows.push(row);
  }

  return {
    rows,
    headers: headerCells.filter((h) => h !== ""),
    sheetName: sheet.name,
    sheetMatchReason: reason,
    headerRow: headerIdx + 1,
    missingRequired: [],
    optionalFound,
  };
}

/**
 * Combine several unit exports (e.g. one per period, because the WMS stops
 * at 50.000 rows). Where exports overlap, a row is taken as often as it
 * occurs in the export that has it most often: identical rows in two files
 * are one HU, two identical rows within one file stay two (exact duplicates
 * within an export are handled later by the SSCC check).
 */
export function mergeWmsExports(parts: readonly ParsedWms[]): ParsedWms & { sources: { sheetName: string; rows: number; added: number }[] } {
  if (parts.length === 0) throw new WmsParseError("Geen unitoverzicht opgegeven.");
  const columns = Object.keys(parts[0]!.rows[0] ?? {}).filter((k) => k !== "__rowIndex" && k !== "__source");
  const sig = (r: RawWmsRow) =>
    columns.map((k) => {
      const v = r[k];
      return v instanceof Date ? v.getTime() : v === null || v === undefined ? "" : String(v).trim();
    }).join("\u0001");
  const taken = new Map<string, number>();
  const rows: RawWmsRow[] = [];
  const sources: { sheetName: string; rows: number; added: number }[] = [];
  parts.forEach((p, fileIdx) => {
    const inFile = new Map<string, number>();
    let added = 0;
    for (const r of p.rows) {
      const s = sig(r);
      const n = (inFile.get(s) ?? 0) + 1;
      inFile.set(s, n);
      if (n > (taken.get(s) ?? 0)) {
        taken.set(s, n);
        rows.push({ ...r, __source: fileIdx });
        added++;
      }
    }
    sources.push({ sheetName: p.sheetName, rows: p.rows.length, added });
  });
  const first = parts[0]!;
  return {
    ...first,
    rows,
    optionalFound: {
      vertrek: parts.find((p) => p.optionalFound.vertrek)?.optionalFound.vertrek ?? null,
      losdatum: parts.find((p) => p.optionalFound.losdatum)?.optionalFound.losdatum ?? null,
      sscc: parts.find((p) => p.optionalFound.sscc)?.optionalFound.sscc ?? null,
    },
    sources,
  };
}

/** The WMS export limit; an export with exactly this many data rows is probably cut off. */
export const WMS_EXPORT_ROW_LIMIT = 50_000;
