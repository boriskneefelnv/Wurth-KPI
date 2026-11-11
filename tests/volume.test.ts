import { makePeriod } from "@/core/period";
import { reconcileVolume } from "@/core/report/reconcile";
import { computeReportSet } from "@/core/report/report";
import { volumeSlide } from "@/core/slides/volume";
import type { RejectedRow } from "@/core/wms/enrich";
import { materializeRides } from "@/core/wms/rides";
import { parseDateValue } from "@/core/dates";
import { times, unit } from "./fixtures";

/** n outbound HUs on one ride, on one day. */
type Extra = Parameters<typeof unit>[0];
const out = (ride: string, day: string, n: number, extra: Extra = {}) =>
  times(n, () => unit({ uitgaandeRit: ride, uitslag: day, inslag: "2025-01-02", ...extra }));
const inb = (ride: string, day: string, n: number, extra: Extra = {}) =>
  times(n, () => unit({ inkomendeRit: ride, inslag: day, ...extra }));

const units = [
  // Q2 2025 (same quarter last year): 100 HUs out to DE
  ...out("A1", "2025-04-10", 40),
  ...out("A2", "2025-05-12", 30),
  ...out("A3", "2025-06-11", 30),
  // Q1 2026 (previous quarter): 120 HUs out
  ...out("B1", "2026-02-10", 120),
  // Q2 2026: 150 HUs out, the extra 50 go to FR
  ...out("C1", "2026-04-08", 20),
  ...out("C2", "2026-05-13", 50),
  ...out("C3", "2026-06-10", 30, { principal: "AWKG" }),
  ...out("C4", "2026-06-10", 20, { losLand: "FR" }),
  ...out("C6", "2026-06-12", 30, { losLand: "FR" }),
  // inbound Q2 2026 and Q2 2025
  ...inb("I1", "2026-05-05", 60),
  ...inb("I0", "2025-05-05", 80),
];

describe("volume slide model", () => {
  const q2 = makePeriod("quarter", "2026-Q2");
  const set = computeReportSet(units, q2, ["previous", "lastYear"]);

  it("total slide: HUs and rides per month, ghost bars from last year", () => {
    const m = volumeSlide(set, "Total");
    expect(m.title).toBe("Volume total");
    expect(m.buckets.map((b) => b.label)).toEqual(["Apr", "May", "Jun"]);
    expect(m.ghost).toEqual({ kind: "lastYear", label: "Q2 2025" });
    expect(m.outbound.hus).toEqual([20, 50, 80]);
    expect(m.outbound.rides).toEqual([1, 1, 3]);
    expect(m.outbound.ghostHus).toEqual([40, 30, 30]);
    expect(m.outbound.husPerRide).toBe(30); // 150 HUs / 5 rides
    expect(m.outbound.peakDay).toEqual({ day: "2026-05-13", hus: 50 }); // tie with 10 Jun → first day wins
  });

  it("compares totals with both comparison periods", () => {
    const m = volumeSlide(set, "Total");
    expect(m.outbound.comparisons.map((c) => [c.label, c.hus, c.husDeltaPct])).toEqual([
      ["vs Q1 2026", 120, 25],
      ["vs Q2 2025", 100, 50],
    ]);
    expect(m.inbound.comparisons[1]).toMatchObject({ hus: 80, husDeltaPct: -25 });
  });

  it("writes a short headline and a supporting line without dashes", () => {
    const m = volumeSlide(set, "Total");
    expect(m.headline).toBe("Outbound up 50% on Q2 2025, inbound down 25%.");
    // AWKG (30 HUs, none last year) explains most of the +50: named as the driver
    expect(m.subline).toBe("AWKG had no volume in Q2 2025 and accounts for 30 of the outbound HUs. Busiest day was 5 May with 60 HUs in.");
    const wiag = volumeSlide(set, "WIAG");
    expect(wiag.subline).toMatch(/^The outbound increase comes mainly from France \(50 more HUs\)\./);
    const awkg = volumeSlide(set, "AWKG");
    expect(awkg.headline).toBe("30 HUs out on 1 ride, 0 HUs in on 0 rides.");
    expect(awkg.subline).toMatch(/^AWKG had no volume yet in Q2 2025\./);
    expect(`${m.headline} ${m.subline}`).not.toMatch(/[\u2013\u2014\u2212]/);
  });

  it("principal slide only counts that principal", () => {
    const m = volumeSlide(set, "AWKG");
    expect(m.outbound.hus).toEqual([0, 0, 30]);
    expect(m.outbound.comparisons[1]!.husDeltaPct).toBeNull(); // AWKG had nothing last year
  });

  it("month report: weekly bars and no ghost bars (weeks do not line up)", () => {
    const m = volumeSlide(computeReportSet(units, makePeriod("month", "2026-06"), ["previous"]), "Total");
    expect(m.buckets.map((b) => b.label)).toEqual(["Wk 23", "Wk 24", "Wk 25", "Wk 26", "Wk 27"]);
    expect(m.ghost).toBeNull();
    expect(m.outbound.ghostHus).toBeNull();
    expect(m.outbound.comparisons[0]).toMatchObject({ label: "vs May 2026", hus: 50 });
  });

  it("week report compares day by day with the previous week", () => {
    const m = volumeSlide(computeReportSet(units, makePeriod("week", "2026-W24"), ["previous"]), "Total");
    expect(m.buckets[0]!.label).toBe("Mon 08-06");
    expect(m.ghost).toEqual({ kind: "previous", label: "Week 23 2026" });
    expect(m.outbound.hus).toEqual([0, 0, 50, 0, 30, 0, 0]);
  });

  it("without comparison it describes the period itself", () => {
    const m = volumeSlide(computeReportSet(units, q2, []), "Total");
    expect(m.headline).toBe("150 HUs out on 5 rides, 60 HUs in on 1 ride.");
  });
});

describe("volume reconciliation", () => {
  it("explains rows in file → rejected → counted, and rides counted in another period", () => {
    const us = [
      ...out("R1", "2026-04-30", 30),
      ...out("R1", "2026-05-01", 1), // straggler (1/31 < 5%): ride R1 belongs to April
      ...out("R2", "2026-05-04", 5, { principal: "Overig", opdrachtgever: "Würth Nederland" }),
      unit({ uitslag: "2026-05-06" }), // no ride
    ];
    const rejected: RejectedRow[] = [
      { rowIndex: 99, reason: "status", detail: "Cancel", inslagUnit: null, uitslagUnit: parseDateValue("2026-05-07"), opdrachtgever: "WIAG" },
      { rowIndex: 98, reason: "invalid-weight", detail: "0", inslagUnit: null, uitslagUnit: parseDateValue("2026-04-07"), opdrachtgever: "WIAG" },
    ];
    const r = reconcileVolume(us, rejected, materializeRides(us).rides, makePeriod("month", "2026-05")).outbound;
    expect(r).toMatchObject({
      rowsInFile: 8,
      rejected: { status: 1 },
      counted: 7,
      perPrincipal: { WIAG: 2, Overig: 5 },
      overigClients: { "Würth Nederland": 5 },
      husWithoutRide: 1,
      rides: 1,
      rideNumbersOnHus: 2,
      ridesCountedElsewhere: ["R1"],
    });
  });
});
