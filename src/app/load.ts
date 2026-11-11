import { WMS_EXPORT_ROW_LIMIT, mergeWmsExports, parseWmsSheets, type ParsedWms } from "../core/wms/excel";
import { detectExport, type ExportKind } from "../core/wms/detect";
import { enrichWms, type EnrichValidation } from "../core/wms/enrich";
import { parseRideList, type ParsedRideList } from "../core/wms/rideLists";
import { readXlsx } from "../core/wms/xlsxReader";
import type { WmsUnit } from "../core/types";

export interface FileInfo {
  name: string;
  kind: ExportKind | null;
  rows: number;
  /** Rows taken over from this file (unit exports overlap). */
  added?: number;
  dateRange?: { from: string; to: string } | null;
  warning?: string;
  error?: string;
}

export interface Dataset {
  files: FileInfo[];
  units: WmsUnit[];
  validation: EnrichValidation | null;
  lists: ParsedRideList[];
}

/** Read, recognise and combine the dropped WMS exports. Runs in a web worker. */
export async function loadExports(files: { name: string; data: ArrayBuffer }[], progress: (msg: string) => void = () => {}): Promise<Dataset> {
  const infos: FileInfo[] = [];
  const unitParts: { info: FileInfo; parsed: ParsedWms }[] = [];
  const lists: ParsedRideList[] = [];
  for (const f of files) {
    progress(`${f.name} lezen…`);
    const info: FileInfo = { name: f.name, kind: null, rows: 0 };
    infos.push(info);
    try {
      const sheets = await readXlsx(new Uint8Array(f.data));
      info.kind = detectExport(sheets);
      if (info.kind === "units") {
        const parsed = parseWmsSheets(sheets);
        info.rows = parsed.rows.length;
        if (parsed.rows.length >= WMS_EXPORT_ROW_LIMIT) {
          info.warning = `Precies ${WMS_EXPORT_ROW_LIMIT.toLocaleString("nl-NL")} rijen: waarschijnlijk afgekapt door de WMS. Exporteer in kleinere periodes.`;
        }
        unitParts.push({ info, parsed });
      } else if (info.kind) {
        const list = parseRideList(sheets, info.kind === "ride-list-outbound" ? "outbound" : "inbound");
        info.rows = list.rawRowCount;
        info.dateRange = list.dateRange;
        lists.push(list);
      } else {
        info.error = "Niet herkend als unitoverzicht, Te laden of Te lossen.";
      }
    } catch (e) {
      info.error = e instanceof Error ? e.message : String(e);
    }
  }
  if (unitParts.length === 0) return { files: infos, units: [], validation: null, lists };
  progress("Unitoverzichten samenvoegen en controleren…");
  const merged = mergeWmsExports(unitParts.map((p) => p.parsed));
  merged.sources.forEach((s, i) => (unitParts[i]!.info.added = s.added));
  const enriched = enrichWms(merged);
  return { files: infos, units: enriched.units, validation: enriched.validation, lists };
}
