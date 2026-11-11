import { WMS_EXPORT_ROW_LIMIT, mergeWmsExports, parseWmsSheets, type ParsedWms } from "../core/wms/excel";
import { detectExport, type ExportKind } from "../core/wms/detect";
import { enrichWms, type EnrichValidation } from "../core/wms/enrich";
import { parseRideList, type ParsedRideList } from "../core/wms/rideLists";
import { readXlsx } from "../core/wms/xlsxReader";
import { dayKey } from "../core/dates";
import { fileSpan, type FileSpan } from "../core/wms/requirements";
import type { WmsUnit } from "../core/types";

export interface FileInfo {
  name: string;
  kind: ExportKind | null;
  rows: number;
  /** Rows taken over from this file (unit exports overlap). */
  added?: number;
  /** Ride lists: planned dates; unit overviews: Laaddatum range (stray dates ignored). */
  span?: FileSpan | null;
  /** The export has exactly the WMS row limit and is probably cut off. */
  capped?: boolean;
  warning?: string;
  error?: string;
}

export interface Dataset {
  files: FileInfo[];
  units: WmsUnit[];
  validation: EnrichValidation | null;
  lists: ParsedRideList[];
}

interface Entry {
  info: FileInfo;
  parsed?: ParsedWms;
  list?: ParsedRideList;
}

function laaddatums(p: ParsedWms): string[] {
  const out: string[] = [];
  for (const r of p.rows) {
    const v = r["Laaddatum"];
    if (v instanceof Date && !Number.isNaN(v.getTime())) out.push(dayKey(v));
  }
  return out;
}

/**
 * Keeps the exports dropped so far (runs in a web worker). Files are read
 * once; adding or removing a file only redoes the cheap merge and enrichment.
 * A file with the same name replaces the earlier one.
 */
export class ExportStore {
  private entries = new Map<string, Entry>();

  async add(files: { name: string; data: ArrayBuffer }[], progress: (msg: string) => void = () => {}) {
    for (const f of files) {
      progress(`${f.name} lezen…`);
      const info: FileInfo = { name: f.name, kind: null, rows: 0 };
      const entry: Entry = { info };
      try {
        const sheets = await readXlsx(new Uint8Array(f.data));
        info.kind = detectExport(sheets);
        if (info.kind === "units") {
          entry.parsed = parseWmsSheets(sheets);
          info.rows = entry.parsed.rows.length;
          info.capped = entry.parsed.rows.length >= WMS_EXPORT_ROW_LIMIT;
          info.span = fileSpan(laaddatums(entry.parsed), info.capped);
        } else if (info.kind) {
          entry.list = parseRideList(sheets, info.kind === "ride-list-outbound" ? "outbound" : "inbound");
          info.rows = entry.list.rawRowCount;
          info.capped = entry.list.rawRowCount >= WMS_EXPORT_ROW_LIMIT;
          const dates = entry.list.rides.map((r) => r.plannedDate).filter((d): d is string => d !== null).sort();
          info.span = dates.length ? { from: dates[0]!, to: dates[dates.length - 1]!, capped: info.capped } : null;
        } else {
          info.error = "Niet herkend als unitoverzicht, Te laden of Te lossen.";
        }
      } catch (e) {
        info.error = e instanceof Error ? e.message : String(e);
      }
      this.entries.set(f.name, entry);
    }
  }

  remove(name: string) {
    this.entries.delete(name);
  }

  clear() {
    this.entries.clear();
  }

  dataset(progress: (msg: string) => void = () => {}): Dataset {
    const all = [...this.entries.values()];
    const lists = all.flatMap((e) => (e.list ? [e.list] : []));
    const unitEntries = all.filter((e) => e.parsed);
    if (unitEntries.length === 0) return { files: all.map((e) => e.info), units: [], validation: null, lists };
    progress("Unitoverzichten samenvoegen en controleren…");
    const merged = mergeWmsExports(unitEntries.map((e) => e.parsed!));
    merged.sources.forEach((s, i) => (unitEntries[i]!.info.added = s.added));
    const enriched = enrichWms(merged);
    return { files: all.map((e) => e.info), units: enriched.units, validation: enriched.validation, lists };
  }
}

/** One-shot helper (scripts, tests). */
export async function loadExports(files: { name: string; data: ArrayBuffer }[], progress?: (msg: string) => void): Promise<Dataset> {
  const store = new ExportStore();
  await store.add(files, progress);
  return store.dataset(progress);
}
