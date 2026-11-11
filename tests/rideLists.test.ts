import { makePeriod } from "@/core/period";
import { buildContext } from "@/core/report/context";
import { reconcileRideLists } from "@/core/report/reconcile";
import { computeVolume } from "@/core/report/workload";
import type { SheetData } from "@/core/wms/excel";
import { indexPlannedRides, parseRideList, RideListParseError } from "@/core/wms/rideLists";
import { materializeRides } from "@/core/wms/rides";
import { times, unit } from "./fixtures";

const LADEN_HEADERS = ["Afdeling", "Ritnummer", "Referentie", "Status omschrijving", "Zendingen", "Units", "Verwachte datum", "Tijd", "loadAllowed"];
const LOSSEN_HEADERS = ["Afdeling", "Ritnummer", "Referentie", "Status omschrijving", "Zendingen", "Units", "Verwachte datum", "Tijd", "Units verplaatst"];

const laden = (rows: [rit: number, ref: string, status: string, units: number, date: string][]): SheetData => ({
  name: "Sheet0",
  rows: [LADEN_HEADERS, ...rows.map(([rit, ref, status, units, date]) => ["2665", rit, ref, status, 1, units, date, "13:00:00", "Y"])],
});
const lossen = (rows: [rit: number, ref: string, status: string, units: number, date: string][]): SheetData => ({
  name: "Sheet0",
  rows: [LOSSEN_HEADERS, ...rows.map(([rit, ref, status, units, date]) => ["2665", rit, ref, status, 1, units, date, "12:00:00", "Units reeds geladen"])],
});

describe("parseRideList", () => {
  it("detects the direction and merges rows of the same ride", () => {
    const list = parseRideList([
      laden([
        [266500005285, "2001694060", "Geladen", 6, "2026-06-05"],
        [266500005285, "2001694060", "In afwachting", 0, "2026-01-15"],
        [266500005285, "2001694060", "Geladen", 0, "2026-06-05"],
        [266500003510, "6100264033", "Geladen", 43, "2026-01-08"],
      ]),
    ]);
    expect(list.direction).toBe("outbound");
    expect(list.rides).toHaveLength(2);
    expect(list.rides[0]).toMatchObject({
      ritNummer: "266500005285",
      plannedDate: "2026-06-05",
      units: 6,
      status: "Geladen",
      completed: true,
      rowCount: 3,
    });
    expect(list.dateRange).toEqual({ from: "2026-01-08", to: "2026-06-05" });
  });

  it("flags test, cancelled and unfinished rides", () => {
    const list = parseRideList([
      lossen([
        [1, "2001658093 TEST", "Gelost", 18, "2026-01-06"],
        [2, "A12336196 CANCEL", "In transit", 0, "2026-03-29"],
        [3, "Benelux", "In transit", 1, "2026-05-29"],
      ]),
    ]);
    expect(list.direction).toBe("inbound");
    expect(list.rides.map((r) => [r.isTest, r.isCancelled, r.completed])).toEqual([
      [true, false, true],
      [false, true, false],
      [false, false, false],
    ]);
  });

  it("refuses files without the ride columns", () => {
    expect(() => parseRideList([{ name: "x", rows: [["a", "b"]] }])).toThrow(RideListParseError);
  });
});

describe("planned dates", () => {
  const planned = indexPlannedRides([
    parseRideList([
      laden([
        [7001, "r", "Geladen", 3, "2026-03-31"],
        [7002, "r", "Geladen", 0, "2026-04-02"], // empty → not used for dating
        [7003, "r", "Geladen", 50, "2026-04-03"], // not in unit file
      ]),
    ]),
  ]);
  const units = [
    // scanned 1 April, but the ride list says 31 March → ride and HUs count in March
    ...times(3, () => unit({ uitgaandeRit: "7001", uitslag: "2026-04-01 06:00" })),
    unit({ uitgaandeRit: "7002", uitslag: "2026-04-02" }),
    unit({ uitgaandeRit: "7009", uitslag: "2026-04-02" }), // not on the list
    unit({ uitslag: "2026-04-02" }), // no ride
  ];
  const { rides, listOnlyRides } = materializeRides(units, { planned });

  it("uses Verwachte datum as ride date and keeps the scan date", () => {
    expect(rides.find((r) => r.ritNummer === "7001")).toMatchObject({
      canonicalDate: "2026-03-31",
      scanDate: "2026-04-01",
      dateResolution: "planned",
      plannedUnits: 3,
      period: "2026-03",
    });
    expect(rides.find((r) => r.ritNummer === "7002")).toMatchObject({ canonicalDate: "2026-04-02", dateResolution: "single" });
    expect(listOnlyRides.map((r) => r.ritNummer)).toEqual(["7003"]);
  });

  it("counts HUs on the day of their ride; HUs without a ride on their scan", () => {
    const april = computeVolume(buildContext(units, makePeriod("month", "2026-04"), {}, rides), "hus");
    expect(april.outbound.Total.total).toBe(3); // 7002, 7009, no-ride
    const march = computeVolume(buildContext(units, makePeriod("month", "2026-03"), {}, rides), "hus");
    expect(march.outbound.Total.total).toBe(3);
    const byScan = computeVolume(buildContext(units, makePeriod("month", "2026-04"), { huDating: "scan" }, rides), "hus");
    expect(byScan.outbound.Total.total).toBe(6);
  });

  it("reconciles the list with the unit file", () => {
    const r = reconcileRideLists(units, planned, rides, makePeriod("quarter", "2026-Q2")).outbound;
    expect(r).toMatchObject({
      listRides: 1, // 7003 (7001 is in March, 7002 is empty)
      listUnits: 50,
      ignored: { empty: 1 },
      matchedRides: 0,
      missingInUnitFile: { rides: 1, units: 50 },
      notOnList: { rides: 1, hus: 1 },
      completeness: 0,
    });
    const q1 = reconcileRideLists(units, planned, rides, makePeriod("quarter", "2026-Q1")).outbound;
    expect(q1).toMatchObject({ listUnits: 3, matchedUnitFileHus: 3, completeness: 1, dateAgreement: { sameDay: 0, withinOneDay: 1, otherMonth: 1 } });
    expect(q1.perBucket.map((b) => [b.label, b.listUnits])).toEqual([["Jan", 0], ["Feb", 0], ["Mar", 3]]);
  });
});
