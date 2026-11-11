import { checkUnitExport, lastScanDay, unitExportRange } from "@/core/wms/exportRange";
import type { ParsedRideList } from "@/core/wms/rideLists";
import { unit } from "./fixtures";

const list = (from: string, to: string): ParsedRideList => ({ direction: "outbound", sheetName: "S", rides: [], dateRange: { from, to }, rawRowCount: 0 });

describe("unit export range", () => {
  it("advises 4 months before the first ride month up to 1 month after the last ride", () => {
    const r = unitExportRange([list("2026-01-02", "2026-06-30"), { ...list("2026-01-05", "2026-06-29"), direction: "inbound" }], "2026-11-11");
    expect(r).toEqual({ rides: { from: "2026-01-02", to: "2026-06-30" }, from: "2025-09-01", to: "2026-07-30" });
  });

  it("never advises an end date after today", () => {
    expect(unitExportRange([list("2026-01-02", "2026-11-28")], "2026-11-11")!.to).toBe("2026-11-11");
  });

  it("checks whether the loaded units cover the advice", () => {
    const advice = unitExportRange([list("2026-01-02", "2026-06-30")], "2026-11-11")!;
    const late = checkUnitExport([unit({ laaddatum: "2026-01-05" }), unit({ laaddatum: "2026-06-30" })], advice);
    expect(late).toMatchObject({ ok: false, missingStart: { from: "2025-09-01", to: "2026-01-04" }, missingEnd: { from: "2026-07-01", to: "2026-07-30" } });
    const good = checkUnitExport([unit({ laaddatum: "2025-09-03" }), unit({ laaddatum: "2026-07-28" })], advice);
    expect(good.ok).toBe(true);
  });

  it("finds the last scan day", () => {
    expect(lastScanDay([unit({ inslag: "2026-11-10", uitslag: "2026-11-11" }), unit({ inslag: "2026-10-01" })])).toBe("2026-11-11");
  });
});
