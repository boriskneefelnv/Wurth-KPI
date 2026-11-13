import { buildContext } from "@/core/report/context";
import { computeDailyVolume } from "@/core/report/daily";
import { computeOutbound } from "@/core/report/outbound";
import { classifyProfile, computeFlow } from "@/core/report/profiles";
import { computeInboundStocked, computeOnTimeLoading } from "@/core/report/punctuality";
import { computeReport } from "@/core/report/report";
import { computeStock } from "@/core/report/stock";
import { computeStorage, computeStorageDestinations } from "@/core/report/storage";
import { computeContainerMix, computeDestinations, computeVolume } from "@/core/report/workload";
import type { WmsUnit } from "@/core/types";
import type { PlannedRideIndex } from "@/core/wms/rideLists";
import { materializeRides } from "@/core/wms/rides";
import { customPeriod, makePeriod, type ReportPeriod } from "@/core/period";
import { periodEnd } from "@/core/dates";
import { times, unit } from "./fixtures";

/** One month → month report; several months → custom range with monthly bars. */
const months = (ms: string[]): ReportPeriod =>
  ms.length === 1 ? makePeriod("month", ms[0]!) : customPeriod(`${ms[0]}-01`, periodEnd(ms[ms.length - 1]!).toISOString().slice(0, 10));
const ctx = (units: WmsUnit[], periods: string[], opts = {}) => buildContext(units, months(periods), opts);

describe("volume", () => {
  const units = [
    // Ride R1 (WIAG + AWKG): 3 HUs on 2 Apr, 1 HU straggler on 1 May → canonical 2 Apr (25% ≥ 5% though!)
    ...times(3, () => unit({ uitgaandeRit: "R1", uitslag: "2026-04-02", principal: "WIAG" })),
    unit({ uitgaandeRit: "R1", uitslag: "2026-04-02", principal: "AWKG" }),
    // Ride R2: WIAG only, March
    ...times(2, () => unit({ uitgaandeRit: "R2", uitslag: "2026-03-10", principal: "WIAG" })),
    // Inbound
    unit({ inkomendeRit: "I1", inslag: "2026-03-05", principal: "Liqui Moly" }),
  ];

  it("counts HUs per month and principal", () => {
    const v = computeVolume(ctx(units, ["2026-03", "2026-04"]), "hus");
    expect(v.buckets.map((b) => b.label)).toEqual(["Mar", "Apr"]);
    expect(v.outbound.WIAG.buckets).toEqual([2, 3]);
    expect(v.outbound.AWKG.buckets).toEqual([0, 1]);
    expect(v.outbound.Total).toMatchObject({ buckets: [2, 4], total: 6, avgPerBucket: 3 });
    expect(v.outbound.Total.peak).toEqual({ label: "Apr", value: 4 });
    expect(v.outbound.Total.peakDay).toEqual({ day: "2026-04-02", value: 4 });
    expect(v.inbound["Liqui Moly"].total).toBe(1);
    // 22 workdays in March 2026 + 20 in April 2026 (Easter Monday and King's Day closed)
    expect(v.outbound.Total.avgPerWorkday).toBeCloseTo(6 / 42);
  });

  it("counts each ride once, on its canonical day; shared rides count for every principal", () => {
    const v = computeVolume(ctx(units, ["2026-03", "2026-04"]), "rides");
    expect(v.outbound.Total.buckets).toEqual([1, 1]);
    expect(v.outbound.WIAG.buckets).toEqual([1, 1]);
    expect(v.outbound.AWKG.buckets).toEqual([0, 1]);
  });

  it("uses ISO-week buckets for a month report; empty weeks count in the average", () => {
    const v = computeVolume(ctx(units, ["2026-04"]), "hus");
    expect(v.buckets.map((b) => b.label)).toEqual(["Wk 14", "Wk 15", "Wk 16", "Wk 17", "Wk 18"]);
    expect(v.outbound.Total.buckets).toEqual([4, 0, 0, 0, 0]);
    expect(v.outbound.Total.avgPerBucket).toBe(0.8);
  });
});

describe("container mix and destinations", () => {
  const units = [
    ...times(3, () => unit({ uitgaandeRit: "R1", uitslag: "2026-04-02", shipmentType: "40H", losLand: "DE" })),
    unit({ uitgaandeRit: "R1", uitslag: "2026-04-02", shipmentType: "Onbekend", losLand: "AT" }),
    unit({ uitgaandeRit: "R2", uitslag: "2026-04-03", shipmentType: "LCL", losLand: "DE", principal: "AWKG" }),
  ];
  const c = ctx(units, ["2026-04"]);

  it("HU mix counts every HU", () => {
    const mix = computeContainerMix(c, "hus");
    expect(mix.total.counts).toMatchObject({ "40H": 3, LCL: 1, Onbekend: 1 });
    expect(mix.total.shares["40H"]).toBeCloseTo(0.6);
  });

  it("ride mix uses the dominant known type per ride", () => {
    const mix = computeContainerMix(c, "rides");
    expect(mix.total.counts).toMatchObject({ "40H": 1, LCL: 1, Onbekend: 0 });
    expect(mix.perPrincipal.AWKG.counts.LCL).toBe(1);
  });

  it("ride destinations count a multi-drop ride in each country", () => {
    const d = computeDestinations(c, "rides");
    expect(d.rows.map((r) => [r.country, r.total])).toEqual([["DE", 2], ["AT", 1]]);
  });

  it("aggregates beyond the top 10 into Overig", () => {
    const many = times(12, (i) => unit({ uitslag: "2026-04-02", losLand: `C${String(i).padStart(2, "0")}` }));
    const d = computeDestinations(ctx(many, ["2026-04"]), "hus");
    expect(d.rows).toHaveLength(11);
    expect(d.rows[10]).toMatchObject({ country: "Overig", total: 2 });
  });
});

describe("outbound totals", () => {
  it("sums HUs/kg by outbound month and rides by canonical day", () => {
    const units = [
      unit({ uitgaandeRit: "R1", uitslag: "2026-04-02", brutoKg: 100, losLand: "DE" }),
      unit({ uitgaandeRit: "R1", uitslag: "2026-04-02", brutoKg: 50, losLand: "AT" }),
      unit({ uitgaandeRit: "R2", uitslag: "2026-04-03", brutoKg: 25, losLand: "DE" }),
      unit({ uitslag: "2026-04-03", brutoKg: 10, losLand: "DE" }), // no ride
    ];
    const o = computeOutbound(ctx(units, ["2026-04"]));
    expect(o).toMatchObject({ totalHus: 4, totalKg: 185, rides: 2, avgHusPerRide: 1.5 });
    expect(o.countries.map((c) => [c.country, c.rides, c.hus])).toEqual([
      ["DE", 2, 3],
      ["AT", 1, 1],
    ]);
  });
});

/** Ride list index with the given planned rides. */
function plannedIndex(rides: [direction: "inbound" | "outbound", rit: string, date: string, units: number][]): PlannedRideIndex {
  const idx: PlannedRideIndex = { inbound: new Map(), outbound: new Map() };
  for (const [direction, ritNummer, plannedDate, n] of rides) {
    idx[direction].set(ritNummer, {
      direction, ritNummer, plannedDate, plannedTime: "13:00:00", units: n, shipments: 1, status: direction === "outbound" ? "Geladen" : "Gelost",
      completed: true, referentie: "", afdeling: "2665", rowCount: 1, isTest: false, isCancelled: false,
    });
  }
  return idx;
}

describe("on-time loading", () => {
  const units = [
    // R1 on time (same day)
    unit({ uitgaandeRit: "R1", uitslag: "2026-04-02 18:00", vertrek: "2026-04-02 06:00", principal: "WIAG" }),
    // R2: first HU on time, last HU a day late
    unit({ uitgaandeRit: "R2", uitslag: "2026-04-02", vertrek: "2026-04-02", principal: "AWKG" }),
    ...times(30, () => unit({ uitgaandeRit: "R2", uitslag: "2026-04-03", vertrek: "2026-04-02", principal: "AWKG" })),
    // R3 late
    unit({ uitgaandeRit: "R3", uitslag: "2026-04-05", vertrek: "2026-04-04", principal: "WIAG" }),
    // R4 not measurable (no planned departure)
    unit({ uitgaandeRit: "R4", uitslag: "2026-04-05" }),
  ];

  it("last pallet rule (default): the whole ride out by the planned day", () => {
    const r = computeOnTimeLoading(ctx(units, ["2026-04"]));
    expect(r).toMatchObject({ ok: 1, notOk: 2, notMeasurable: 1, target: 95, meetsTarget: false });
    expect(r.perPrincipal.WIAG).toMatchObject({ ok: 1, notOk: 1 });
    expect(r.exceptions.map((e) => e.ritNummer)).toEqual(["R2", "R3"]);
  });

  it("earliest rule (as in Lovable): loading started by the planned day", () => {
    const r = computeOnTimeLoading(ctx(units, ["2026-04"], { onTimeRule: "earliest" }));
    expect(r).toMatchObject({ ok: 2, notOk: 1 });
  });

  it("uses the ride list date and counts lateness in workdays", () => {
    // List: R2 planned Thu 2 Apr (last pallet Fri 3 Apr: 1 workday late),
    //       R3 planned Wed 1 Apr (out Sun 5 Apr: Thu+Fri = 2 workdays late)
    const planned = plannedIndex([["outbound", "R1", "2026-04-02", 1], ["outbound", "R2", "2026-04-02", 31], ["outbound", "R3", "2026-04-01", 1]]);
    const { rides } = materializeRides(units, { planned });
    const r = computeOnTimeLoading(buildContext(units, months(["2026-04"]), {}, rides));
    expect(r).toMatchObject({ ok: 1, notOk: 2, notMeasurable: 0, lateByWorkdays: { 1: 1, 2: 1 }, withinOneWorkday: { ok: 2, notOk: 1 } });
  });

  it("returns null pct when nothing is measurable", () => {
    expect(computeOnTimeLoading(ctx([unit({ uitgaandeRit: "R9", uitslag: "2026-04-01" })], ["2026-04"])).pct).toBeNull();
  });
});

describe("inbound stocked", () => {
  it("every pallet scanned in within one workday after the planned unloading day from Te lossen", () => {
    const units = [
      unit({ inkomendeRit: "I1", inslag: "2026-04-02 20:00" }),
      unit({ inkomendeRit: "I1", inslag: "2026-04-02 21:00" }),
      unit({ inkomendeRit: "I2", inslag: "2026-04-02" }),
      unit({ inkomendeRit: "I2", inslag: "2026-04-03" }), // one workday after unloading: still on time
      unit({ inkomendeRit: "I3", inslag: "2026-04-03" }), // not on the list
      unit({ inkomendeRit: "I4", inslag: "2026-04-07" }), // Fri 3 Apr and (after Easter Monday) Tue 7 Apr: two workdays
    ];
    const planned = plannedIndex([["inbound", "I1", "2026-04-02", 2], ["inbound", "I2", "2026-04-02", 2], ["inbound", "I4", "2026-04-02", 1]]);
    const { rides } = materializeRides(units, { planned });
    const r = computeInboundStocked(buildContext(units, months(["2026-04"]), {}, rides));
    expect(r).toMatchObject({ ok: 2, notOk: 1, graceWorkdays: 1, onPlannedDay: { ok: 1, notOk: 2 }, lateByWorkdays: { 2: 1 } });
  });

  it("is not measurable without ride lists", () => {
    const r = computeInboundStocked(ctx([unit({ inkomendeRit: "I1", inslag: "2026-04-02" })], ["2026-04"]));
    expect(r).toMatchObject({ pct: null, notMeasurable: 1 });
  });
});

describe("storage", () => {
  const units = [
    ...times(5, (i) => unit({ uitslag: "2026-04-02", dagenInOpslag: 10 + i, losLand: "DE", principal: "WIAG" })),
    ...times(2, () => unit({ uitslag: "2026-04-02", dagenInOpslag: 100, losLand: "DE", principal: "AWKG" })),
    ...times(4, () => unit({ uitslag: "2026-04-02", dagenInOpslag: 50, losLand: "AT" })),
    unit({ uitslag: "2026-03-02", dagenInOpslag: 999 }), // other month
    unit({ inslag: "2026-04-01", dagenInOpslag: 3 }), // not shipped
  ];
  const c = ctx(units, ["2026-04"]);

  it("mean, median and buckets over outbound HUs", () => {
    const s = computeStorage(c);
    expect(s.total.count).toBe(11);
    expect(s.total.medianDays).toBe(50); // 10..14, 4×50, 2×100
    expect(s.total.buckets).toEqual({ "0-7": 0, "8-14": 5, "15-30": 0, "31-60": 4, ">60": 2 });
    expect(s.perPrincipal.AWKG.avgDays).toBe(100);
  });

  it("storage per destination, most HUs first, per principal", () => {
    const t = computeStorageDestinations(c);
    expect(t.Total.map((r) => [r.country, r.hus, r.avgDays])).toEqual([["DE", 7, (10 + 11 + 12 + 13 + 14 + 200) / 7], ["AT", 4, 50]]);
    expect(t.WIAG).toEqual([{ country: "DE", hus: 5, avgDays: 12, medianDays: 12 }, { country: "AT", hus: 4, avgDays: 50, medianDays: 50 }]); // AT defaults to WIAG
    expect(t.AWKG[0]).toMatchObject({ country: "DE", avgDays: 100 });
  });
});

describe("stock", () => {
  const units = [
    unit({ inslag: "2026-01-15" }), // stays
    unit({ inslag: "2026-02-10", uitslag: "2026-03-31 23:59" }), // leaves at end of March
    unit({ inslag: "2026-03-31 23:59:59", principal: "AWKG" }),
    unit({ inslag: "2026-04-02", uitslag: "2026-04-03" }),
  ];

  it("snapshots at the end of every bucket and the change over the period", () => {
    const s = computeStock(ctx(units, ["2026-02", "2026-03"]));
    expect(s.snapshots.map((x) => [x.day, x.total])).toEqual([
      ["2026-02-28", 2],
      ["2026-03-31", 2],
    ]);
    expect(s.startOfPeriod).toMatchObject({ day: "2026-01-31", total: 1 });
    expect(s.delta).toMatchObject({ total: 1, perPrincipal: { WIAG: 0, AWKG: 1 } });
  });

  it("a unit leaving later the same day is still in stock at end of the previous day", () => {
    const s = computeStock(ctx(units, ["2026-04"]));
    expect(s.startOfPeriod.total).toBe(2);
    expect(s.endOfPeriod.total).toBe(2);
    expect(s.delta!.total).toBe(0);
  });

  it("no delta when the data does not reach back to the start", () => {
    expect(computeStock(ctx([unit({ inslag: "2026-04-02" })], ["2026-04"])).delta).toBeNull();
  });
});

describe("daily volume", () => {
  it("counts HUs on the day of their ride, per principal, workdays plus active weekend days", () => {
    const units = [
      unit({ inkomendeRit: "I1", inslag: "2026-04-02 08:00", principal: "WIAG" }),
      unit({ inkomendeRit: "I1", inslag: "2026-04-02 09:00", principal: "WIAG" }),
      unit({ uitgaandeRit: "R1", uitslag: "2026-04-03", principal: "AWKG" }),
      unit({ uitgaandeRit: "R3", uitslag: "2026-04-04", principal: "Liqui Moly" }), // Saturday
      unit({ uitgaandeRit: "R2", uitslag: "2026-05-01", principal: "WIAG" }), // other month
    ];
    const d = computeDailyVolume(ctx(units, ["2026-04"]));
    // April 2026: 20 workdays (Easter Monday and King's Day off) plus the active Saturday.
    expect(d.days).toHaveLength(21);
    expect(d.days.find((x) => x.day === "2026-04-04")).toEqual({ day: "2026-04-04", workday: false });
    expect(d.days.some((x) => x.day === "2026-04-06")).toBe(false);
    const at = (day: string) => d.days.findIndex((x) => x.day === day);
    expect(d.series.Total.totals).toEqual({ inbound: 2, outbound: 2, total: 4 });
    expect(d.series.Total.avgPerWorkday!.total).toBeCloseTo(4 / 20);
    expect(d.series.Total.peak).toEqual({ day: "2026-04-02", inbound: 2, outbound: 0, total: 2 });
    expect(d.series.Total.inboundRides[at("2026-04-02")]).toBe(1);
    expect(d.series.WIAG.totals.total).toBe(2);
    expect(d.series.AWKG.outbound[at("2026-04-03")]).toBe(1);
    expect(d.series["Liqui Moly"].peak).toMatchObject({ day: "2026-04-04", outbound: 1 });
  });
});

describe("profiles and flow", () => {
  const base = {
    hus: 100,
    typeCounts: { "40S": 0, "40H": 0, "20S": 0, LCL: 0, AIR: 0, FCA: 0 },
    usedTypes: 1,
    dominantType: "40H" as const,
    dominantShare: 0.7,
    topDestination: "DE",
    topDestinationShare: 0.2,
    rides: 4,
    husPerRide: 22,
  };

  it("applies the rules in order", () => {
    expect(classifyProfile({ ...base, usedTypes: 5, typeCounts: { ...base.typeCounts, AIR: 1 } })).toBe("Diversified");
    expect(classifyProfile({ ...base, usedTypes: 3, dominantShare: 0.5 })).toBe("Standardized");
    expect(classifyProfile({ ...base, dominantShare: 0.9, topDestinationShare: 0.5 })).toBe("Mono-type");
    expect(classifyProfile({ ...base, topDestinationShare: 0.31 })).toBe("Concentrated");
    expect(classifyProfile({ ...base, husPerRide: 10 })).toBe("Loose freight");
    expect(classifyProfile({ ...base, husPerRide: 30 })).toBe("Full loads");
    expect(classifyProfile(base)).toBe("Balanced");
  });

  it("flow links principal → type → country", () => {
    const f = computeFlow(ctx([unit({ uitslag: "2026-04-02", shipmentType: "40S", losLand: "DE" })], ["2026-04"]));
    expect(f.links).toEqual([
      { source: "p:WIAG", target: "t:40S", value: 1 },
      { source: "t:40S", target: "c:DE", value: 1 },
    ]);
  });
});

describe("insights and full report", () => {
  it("computes a complete, serialisable report", () => {
    const units = [
      ...times(40, (i) => unit({ uitgaandeRit: `R${i % 4}`, uitslag: "2026-03-10", vertrek: "2026-03-10", dagenInOpslag: 5, losLand: "DE" })),
      ...times(60, (i) =>
        unit({ uitgaandeRit: `S${i % 3}`, uitslag: "2026-04-10", vertrek: "2026-04-10", dagenInOpslag: 9, principal: i % 2 ? "AWKG" : "WIAG", losLand: i % 3 ? "DE" : "FR" }),
      ),
    ];
    const r = computeReport(units, months(["2026-03", "2026-04"]));
    expect(r.period.from).toBe("2026-03-01");
    expect(r.onTimeLoading.pct).toBe(100);
    expect(r.insights.length).toBeGreaterThan(0);
    expect(r.insights.every((i) => i.slide)).toBe(true);
    expect(() => JSON.stringify(r)).not.toThrow();
  });
});
