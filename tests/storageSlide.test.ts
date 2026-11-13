import { makePeriod } from "@/core/period";
import { computeReportSet } from "@/core/report/report";
import { storageSlide } from "@/core/slides/storage";
import { times, unit } from "./fixtures";

// Q2 2026: WIAG 10 and 20 days, AWKG 70 days; Q1 2026: WIAG 20 days.
const units = [
  ...times(2, (i) => unit({ uitgaandeRit: `A${i}`, uitslag: "2026-04-14", dagenInOpslag: 10, principal: "WIAG" })),
  ...times(2, (i) => unit({ uitgaandeRit: `B${i}`, uitslag: "2026-05-12", dagenInOpslag: 20, principal: "WIAG" })),
  unit({ uitgaandeRit: "C1", uitslag: "2026-05-12", dagenInOpslag: 70, principal: "AWKG" }),
  ...times(2, (i) => unit({ uitgaandeRit: `P${i}`, uitslag: "2026-02-10", dagenInOpslag: 20, principal: "WIAG" })),
];

describe("storage slide model", () => {
  const set = computeReportSet(units, makePeriod("quarter", "2026-Q2"), ["previous"]);
  const m = storageSlide(set);

  it("gives average, median, change in days and the spread per principal", () => {
    const w = m.views.WIAG;
    expect(w).toMatchObject({ count: 4, avgDays: 15, medianDays: 15, avgDelta: -5 });
    expect(w.groups.map((g) => [g.label, g.count])).toEqual([
      ["Up to 7 days", 0],
      ["8 to 14 days", 2],
      ["15 to 30 days", 2],
      ["31 to 60 days", 0],
      ["Over 60 days", 0],
    ]);
    expect(w.headline).toBe("HUs stayed 15 days on average (median 15 days), 5 days shorter than in Q1 2026. 100% left the warehouse within 30 days.");
    expect(w.perPeriod.map((p) => [p.label, p.avgDays])).toEqual([["Apr", 10], ["May", 20], ["Jun", null]]);
  });

  it("has no change for a principal without HUs in the comparison period", () => {
    expect(m.views.AWKG.avgDelta).toBeNull();
    expect(m.views.AWKG.groups[4]!.share).toBe(100);
    expect(m.views.Total.headline).toContain("AWKG, not yet active in Q1 2026, averages 70 days.");
    expect(m.views.Total.headline).not.toMatch(/[–—−]/);
  });
});
