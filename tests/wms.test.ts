import ExcelJS from "exceljs";
import { REQUIRED_COLUMNS } from "@/core/constants";
import { parseWmsSheets, WmsParseError, type SheetData } from "@/core/wms/excel";
import { classifyShipmentType, enrichWms, normalizeRide, parseNumber, storageBucket } from "@/core/wms/enrich";
import { readXlsx } from "@/core/wms/xlsxReader";

const HEADERS = [...REQUIRED_COLUMNS, "Vertrek", "Losdatum"];

function row(values: Partial<Record<(typeof HEADERS)[number], unknown>>): unknown[] {
  const defaults: Record<string, unknown> = {
    Referentie: "R1",
    "Bruto kg": 250,
    "Inkomende rit": "IN1",
    "Uitgaande rit": "OUT1",
    Dossiernummer: "D1",
    Omschrijving: "Geladen",
    Laaddatum: "2026-04-02",
    Opdrachtgever: "WIAG",
    Containertype: "45G1",
    "Sealnummer 1": "",
    "Sealnummer 2": "",
    "Sealnummer 3": "",
    "Los land": "DE",
    "Afzender land": "NL",
    "Inslag Unit": "2026-03-20 10:00",
    "Uitslag Unit": "2026-04-02 08:00",
    "Dagen in opslag": 13,
    Vertrek: "2026-04-02",
    Losdatum: "2026-03-20",
  };
  return HEADERS.map((h) => (h in values ? values[h as keyof typeof values] : defaults[h]));
}

const sheet = (rows: unknown[][], name = "Sheet1", preamble: unknown[][] = []): SheetData => ({
  name,
  rows: [...preamble, HEADERS, ...rows],
});

describe("parseWmsSheets", () => {
  it("finds the header row below a preamble and keeps sheet row numbers", () => {
    const parsed = parseWmsSheets([sheet([row({})], "Export WMS", [["Rapport WMS"], []])]);
    expect(parsed.headerRow).toBe(3);
    expect(parsed.rows[0]!.__rowIndex).toBe(4);
    expect(parsed.optionalFound).toEqual({ vertrek: "Vertrek", losdatum: "Losdatum", sscc: null });
  });

  it("picks the sheet with the best header match", () => {
    const other: SheetData = { name: "Info", rows: [["Iets anders"], ["x"]] };
    const parsed = parseWmsSheets([other, sheet([row({})], "Units")]);
    expect(parsed.sheetName).toBe("Units");
    expect(parsed.sheetMatchReason).toBe("header-match");
  });

  it("matches headers case- and whitespace-insensitively", () => {
    const s = sheet([row({})]);
    s.rows[0] = HEADERS.map((h) => `  ${h.toUpperCase()} `);
    expect(parseWmsSheets([s]).rows).toHaveLength(1);
  });

  it("fails with the list of missing required columns", () => {
    const s: SheetData = { name: "X", rows: [["Referentie", "Bruto kg"], ["a", 1]] };
    try {
      parseWmsSheets([s]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(WmsParseError);
      expect((e as WmsParseError).missingColumns).toContain("Uitslag Unit");
    }
  });

  it("skips fully empty rows", () => {
    expect(parseWmsSheets([sheet([row({}), [], ["", null], row({})])]).rows).toHaveLength(2);
  });
});

describe("enrichWms", () => {
  const enrich = (rows: unknown[][]) => enrichWms(parseWmsSheets([sheet(rows)]));

  it("rejects excluded statuses, empty dates and bad weights; keeps negative storage", () => {
    const res = enrich([
      row({ Omschrijving: "Cancel" }),
      row({ Omschrijving: " manual adjustment " }),
      row({ "Inslag Unit": null, "Uitslag Unit": null }),
      row({ "Dagen in opslag": -1 }),
      row({ "Bruto kg": 0 }),
      row({ "Bruto kg": null }),
      row({}),
    ]);
    // Negative storage is kept (it is a real HU movement) without storage days.
    expect(res.units).toHaveLength(2);
    expect(res.units[0]).toMatchObject({ dagenInOpslag: null, storageBucket: null });
    expect(res.validation.negativeStorage).toEqual([{ rowIndex: 5, days: -1 }]);
    expect(res.validation.rejected.map((r) => r.reason)).toEqual([
      "status",
      "status",
      "no-dates",
      "invalid-weight",
      "invalid-weight",
    ]);
    expect(res.validation.excludedStatuses).toEqual({ cancel: 1, "manual adjustment": 1 });
  });

  it("maps unknown clients to Overig and reports them", () => {
    const res = enrich([row({ Opdrachtgever: "Onbekend BV" }), row({ Opdrachtgever: "  liqui   MOLY " })]);
    expect(res.units.map((u) => u.principal)).toEqual(["Overig", "Liqui Moly"]);
    expect(res.validation.unknownPrincipals).toEqual({ "Onbekend BV": 1 });
  });

  it("derives periods, buckets and shipment type only for outbound units", () => {
    const res = enrich([row({}), row({ "Uitslag Unit": null, "Uitgaande rit": "0" })]);
    const [out, inOnly] = res.units as [(typeof res.units)[0], (typeof res.units)[0]];
    expect(out).toMatchObject({ inboundPeriod: "2026-03", outboundPeriod: "2026-04", shipmentType: "40H", storageBucket: "8-14" });
    expect(inOnly).toMatchObject({ outboundPeriod: null, shipmentType: null, uitgaandeRit: null });
    expect(res.availablePeriods).toEqual(["2026-03", "2026-04"]);
  });

  it("reports missing optional columns", () => {
    const s: SheetData = { name: "S", rows: [[...REQUIRED_COLUMNS], REQUIRED_COLUMNS.map(() => "x")] };
    expect(enrichWms(parseWmsSheets([s])).validation.missingOptional.map((m) => m.column)).toEqual(["Vertrek", "Losdatum"]);
  });
});

describe("value helpers", () => {
  it("storage buckets: 60 is 31-60, 61 is >60", () => {
    expect([0, 7, 8, 14, 15, 30, 31, 60, 61].map(storageBucket)).toEqual([
      "0-7", "0-7", "8-14", "8-14", "15-30", "15-30", "31-60", "31-60", ">60",
    ]);
  });

  it("normalises ride ids", () => {
    expect(normalizeRide(" 123 ")).toBe("123");
    expect(normalizeRide(0)).toBeNull();
    expect(normalizeRide("0")).toBeNull();
    expect(normalizeRide(12345)).toBe("12345");
    expect(normalizeRide("12345.0")).toBe("12345");
  });

  it("parses Dutch and English number formats", () => {
    expect(parseNumber("1.234,5")).toBe(1234.5);
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber("")).toBeNull();
  });

  it("classifies shipment types in rule order", () => {
    const c = (type: string, seals: string[] = []) => classifyShipmentType(type, seals);
    expect(c("42G1")).toBe("40S");
    expect(c("40' HC")).toBe("40H");
    expect(c("22G1")).toBe("20S");
    expect(c("", ["20ft container"])).toBe("20S");
    expect(c("", ["LCL zending"])).toBe("LCL");
    expect(c("", ["by AIR"])).toBe("AIR");
    expect(c("", ["FCA Venlo"])).toBe("FCA");
    expect(c("trailer")).toBe("Onbekend");
    // A 40ft code wins over seal markers.
    expect(c("45G0", ["LCL"])).toBe("40H");
  });
});

describe("readXlsx", () => {
  it("reads a real .xlsx including dates and formulas", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("WMS");
    ws.addRow(HEADERS);
    const r = row({ "Inslag Unit": new Date(Date.UTC(2026, 2, 20, 10)), "Bruto kg": { formula: "200+50", result: 250 } });
    ws.addRow(r);
    const buf = await wb.xlsx.writeBuffer();
    const sheets = await readXlsx(new Uint8Array(buf as ArrayBuffer));
    const parsed = parseWmsSheets(sheets);
    expect(parsed.sheetMatchReason).toBe("exact-name");
    const res = enrichWms(parsed);
    expect(res.units[0]).toMatchObject({ brutoKg: 250, inboundPeriod: "2026-03" });
    expect(res.units[0]!.inslagUnit!.toISOString()).toBe("2026-03-20T10:00:00.000Z");
  });
});

describe("duplicate rows", () => {
  const H = [...HEADERS, "Extern"];
  const r = (extern: string, values: Partial<Record<(typeof HEADERS)[number], unknown>> = {}) => [...row(values), extern];
  it("drops exact duplicates (same SSCC, rides and scans) and keeps a pallet that passed twice", () => {
    const s: SheetData = {
      name: "S",
      rows: [H, r("003401"), r("003401"), r("003401", { "Uitgaande rit": "OUT2", "Uitslag Unit": "2026-05-02 08:00" }), r(""), r("")],
    };
    const res = enrichWms(parseWmsSheets([s]));
    expect(res.units).toHaveLength(4);
    expect(res.validation.rejected).toEqual([expect.objectContaining({ rowIndex: 3, reason: "duplicate" })]);
  });
});

describe("mergeWmsExports", () => {
  it("combines overlapping exports without double counting", async () => {
    const { mergeWmsExports } = await import("@/core/wms/excel");
    const a = parseWmsSheets([sheet([row({ Referentie: "A" }), row({ Referentie: "B" }), row({ Referentie: "B" })])]);
    const b = parseWmsSheets([sheet([row({ Referentie: "B" }), row({ Referentie: "C" })])]);
    const merged = mergeWmsExports([a, b]);
    // A, B twice (two identical pallets in export a), C; the B in export b is the same pallet
    expect(merged.rows.map((r) => r["Referentie"])).toEqual(["A", "B", "B", "C"]);
    expect(merged.sources.map((s) => s.added)).toEqual([3, 1]);
  });
});
