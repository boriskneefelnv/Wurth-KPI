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
