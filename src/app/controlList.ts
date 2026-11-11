import ExcelJS from "exceljs";
import type { RideIssue, RideIssueKind } from "../core/report/quality";

export const ISSUE_LABEL: Record<RideIssueKind, string> = {
  "missing-in-unit-file": "Telt niet mee: afgerond op lijst, geen gescande pallets",
  "not-on-ride-list": "Telt niet mee: pallets gescand, rit niet op lijst",
  "outside-ride-list-period": "Telt niet mee: rit valt net buiten de periode van de rittenlijst",
  "unit-count-differs": "Telt mee: aantal gescande pallets wijkt af van lijst",
  "counted-open-status": "Telt mee: pallets gescand, status lijst nog open of cancel",
  "not-handled": "Telt niet mee: status open, niets gescand",
  "ignored-test": "Telt niet mee: testrit",
};

/** Control list of ride issues as an .xlsx file. */
export async function buildControlListXlsx(issues: readonly RideIssue[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ritten om te controleren");
  ws.columns = [
    { header: "Richting", key: "dir", width: 10 },
    { header: "Ritnummer", key: "rit", width: 15 },
    { header: "Bevinding", key: "kind", width: 52 },
    { header: "Verwachte datum", key: "planned", width: 15 },
    { header: "Scandatum (5%)", key: "scan", width: 15 },
    { header: "Status rittenlijst", key: "status", width: 22 },
    { header: "Referentie", key: "ref", width: 22 },
    { header: "Units rittenlijst", key: "list", width: 15 },
    { header: "Gescande pallets", key: "hus", width: 16 },
    { header: "Verschil", key: "diff", width: 10 },
    { header: "Opdrachtgever", key: "opdr", width: 28 },
    { header: "Dossiers (max 10)", key: "dos", width: 40 },
  ];
  for (const i of issues) {
    ws.addRow({
      dir: i.direction === "inbound" ? "Inkomend" : "Uitgaand",
      rit: i.ritNummer,
      kind: ISSUE_LABEL[i.kind],
      planned: i.plannedDate ?? "",
      scan: i.scanDate ?? "",
      status: i.status ?? "",
      ref: i.referentie ?? "",
      list: i.listUnits ?? "",
      hus: i.unitFileHus,
      diff: i.listUnits === null ? "" : i.unitFileHus - i.listUnits,
      opdr: i.opdrachtgevers.join(", "),
      dos: i.dossiers.join(", "),
    });
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "L1" };
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
