import ExcelJS from "exceljs";
import type { SheetData } from "./excel";

/**
 * Reads an .xlsx file into the library-independent SheetData shape.
 * Kept separate from parsing so the Excel library can be swapped
 * (e.g. if the WMS ever delivers legacy .xls files).
 */
export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<SheetData[]> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS' typings expect a Node Buffer; an ArrayBuffer works at runtime in both browser and Node.
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  const sheets: SheetData[] = [];
  wb.eachSheet((ws) => {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        values[colNumber - 1] = cellValue(cell.value);
      });
      rows[rowNumber - 1] = values;
    });
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    sheets.push({ name: ws.name, rows });
  });
  return sheets;
}

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== "object") return v;
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("result" in v) return v.result instanceof Date || typeof v.result !== "object" ? v.result : null;
  if ("text" in v) return v.text;
  if ("error" in v) return null;
  return null;
}
