import { buildContext } from "@/core/report/context";
import { computeDailyVolume } from "@/core/report/daily";
import { incompleteMonths } from "@/core/report/insights";
import { computeOutbound } from "@/core/report/outbound";
import { classifyProfile, computeFlow } from "@/core/report/profiles";
import { computeInboundStocked, computeOnTimeLoading } from "@/core/report/punctuality";
import { computeReport } from "@/core/report/report";
import { computeStock } from "@/core/report/stock";
import { computeStorage, computeStorageTop } from "@/core/report/storage";
import { computeContainerMix, computeDestinations, computeVolume } from "@/core/report/workload";
import type { WmsUnit } from "@/core/types";
import { times, unit } from "./fixtures";

const ctx = (units: WmsUnit[], periods: string[], opts = {}) => buildContext(units, periods, opts);

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
    expect(v.granularity).toBe("month");
    expect(v.outbound.WIAG.buckets).toEqual([2, 3]);
    expect(v.outbound.AWKG.buckets).toEqual([0, 1]);
    expect(v.outbound.Total).toMatchObject({ buckets: [2, 4], total: 6, activeBuckets: 2, avgPerMonth: 3 });
    expect(v.outbound.Total.peak).toEqual({ label: "2026-04", value: 4 });
    expect(v.inbound["Liqui Moly"].total).toBe(1);
    // 22 workdays in March 2026 + 22 in April 2026
    expect(v.outbound.Total.avgPerWorkday).toBeCloseTo(6 / 44);
  });

  it("counts each ride once, on its canonical day; shared rides count for every principal", () => {
    const v = computeVolume(ctx(units, ["2026-03", "2026-04"]), "rides");
    expect(v.outbound.Total.buckets).toEqual([1, 1]);
    expect(v.outbound.WIAG.buckets).toEqual([1, 1]);
    expect(v.outbound.AWKG.buckets).toEqual([0, 1]);
  });

  it("uses weekly buckets for a single month and has no monthly average", () => {
    const v = computeVolume(ctx(units, ["2026-04"]), "hus");
    expect(v.granularity).toBe("week");
    expect(v.outbound.Total.buckets).toEqual([4, 0, 0, 0, 0]);
    expect(v.outbound.Total.avgPerMonth).toBeNull();
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

  it("earliest rule (default)", () => {
    const r = computeOnTimeLoading(ctx(units, ["2026-04"]));
    expect(r).toMatchObject({ ok: 2, notOk: 1, notMeasurable: 1, target: 95, meetsTarget: false });
    expect(r.pct).toBeCloseTo(66.667, 2);
    expect(r.perPrincipal.WIAG).toMatchObject({ ok: 1, notOk: 1 });
    expect(r.exceptions.map((e) => e.ritNummer)).toEqual(["R3"]);
  });

  it("latest rule requires every HU out by the planned day", () => {
    const r = computeOnTimeLoading(ctx(units, ["2026-04"], { onTimeRule: "latest" }));
    expect(r).toMatchObject({ ok: 1, notOk: 2 });
  });

  it("returns null pct when nothing is measurable", () => {
    expect(computeOnTimeLoading(ctx([unit({ uitgaandeRit: "R9", uitslag: "2026-04-01" })], ["2026-04"])).pct).toBeNull();
  });
});

describe("inbound stocked", () => {
  it("requires every HU of the ride to be stocked on or before the unloading day", () => {
    const units = [
      unit({ inkomendeRit: "I1", inslag: "2026-04-02 20:00", losdatum: "2026-04-02 07:00" }),
      unit({ inkomendeRit: "I1", inslag: "2026-04-02 21:00", losdatum: "2026-04-02 07:00" }),
      unit({ inkomendeRit: "I2", inslag: "2026-04-02", losdatum: "2026-04-02" }),
      unit({ inkomendeRit: "I2", inslag: "2026-04-03", losdatum: "2026-04-02" }),
      unit({ inkomendeRit: "I3", inslag: "2026-04-03" }), // no unloading date
    ];
    const r = computeInboundStocked(ctx(units, ["2026-04"]));
    expect(r).toMatchObject({ ok: 1, notOk: 1, notMeasurable: 1, pct: 50 });
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

  it("top destinations need 5 HUs; principal dots need 3", () => {
    const t = computeStorageTop(c);
    expect(t.overall.map((r) => r.country)).toEqual(["DE"]);
    expect(t.overall[0]!.perPrincipal.WIAG.avgDays).toBe(12);
    expect(t.overall[0]!.perPrincipal.AWKG.avgDays).toBeNull();
    expect(t.perPrincipal.WIAG.map((r) => r.country)).toEqual(["DE"]);
  });
});

describe("stock", () => {
  const units = [
    unit({ inslag: "2026-01-15" }), // stays
    unit({ inslag: "2026-02-10", uitslag: "2026-03-31 23:59" }), // leaves at end of March
    unit({ inslag: "2026-03-31 23:59:59", principal: "AWKG" }),
    unit({ inslag: "2026-04-02", uitslag: "2026-04-03" }),
  ];

  it("month-end snapshots for the selected months and a MoM delta", () => {
    const s = computeStock(ctx(units, ["2026-02", "2026-03"]));
    expect(s.snapshots.map((x) => [x.period, x.total])).toEqual([
      ["2026-02", 2],
      ["2026-03", 2],
    ]);
    expect(s.delta).toMatchObject({ from: "2026-02", to: "2026-03", total: 0, perPrincipal: { WIAG: -1, AWKG: 1 } });
  });

  it("single month shows six months and compares with the month before", () => {
    const s = computeStock(ctx(units, ["2026-04"]));
    expect(s.snapshots.map((x) => x.period)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(s.endOfPeriod!.total).toBe(2);
    expect(s.delta!.total).toBe(0);
  });

  it("no delta when the data does not reach back to the baseline month", () => {
    expect(computeStock(ctx([unit({ inslag: "2026-04-02" })], ["2026-04"])).delta).toBeNull();
  });
});

describe("daily volume", () => {
  it("counts inbound by Losdatum and outbound by Laaddatum, ride units only", () => {
    const units = [
      unit({ inkomendeRit: "I1", inslag: "2026-04-03", losdatum: "2026-04-02" }),
      unit({ inkomendeRit: "I1", inslag: "2026-04-03", losdatum: "2026-04-02" }),
      unit({ uitgaandeRit: "R1", uitslag: "2026-04-03", laaddatum: "2026-04-03" }),
      unit({ uitslag: "2026-04-03", laaddatum: "2026-04-03" }), // no ride
      unit({ uitgaandeRit: "R2", uitslag: "2026-05-01", laaddatum: "2026-05-01" }), // other month
    ];
    const d = computeDailyVolume(ctx(units, ["2026-04"]));
    expect(d.perDay).toEqual([
      { day: "2026-04-02", inbound: 2, outbound: 0, total: 2 },
      { day: "2026-04-03", inbound: 0, outbound: 1, total: 1 },
    ]);
    expect(d.avgPerActiveDay!.total).toBe(1.5);
    expect(d.avgPerWorkday!.total).toBeCloseTo(3 / 22);
    expect(d.peak).toEqual({ day: "2026-04-02", total: 2 });
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
  it("flags a month below 25% of the others as incomplete", () => {
    const units = [
      ...times(100, () => unit({ uitslag: "2026-02-10" })),
      ...times(100, () => unit({ uitslag: "2026-03-10" })),
      ...times(10, () => unit({ uitslag: "2026-04-01" })),
    ];
    const v = computeVolume(ctx(units, ["2026-02", "2026-03", "2026-04"]), "hus");
    expect([...incompleteMonths(v)]).toEqual(["2026-04"]);
  });

  it("computes a complete, serialisable report", () => {
    const units = [
      ...times(40, (i) => unit({ uitgaandeRit: `R${i % 4}`, uitslag: "2026-03-10", vertrek: "2026-03-10", dagenInOpslag: 5, losLand: "DE" })),
      ...times(60, (i) =>
        unit({ uitgaandeRit: `S${i % 3}`, uitslag: "2026-04-10", vertrek: "2026-04-10", dagenInOpslag: 9, principal: i % 2 ? "AWKG" : "WIAG", losLand: i % 3 ? "DE" : "FR" }),
      ),
    ];
    const r = computeReport(units, ["2026-04", "2026-03"]);
    expect(r.periods).toEqual(["2026-03", "2026-04"]);
    expect(r.onTimeLoading.pct).toBe(100);
    expect(r.insights.length).toBeGreaterThan(0);
    expect(r.insights.every((i) => i.slide)).toBe(true);
    expect(() => JSON.stringify(r)).not.toThrow();
  });
});
