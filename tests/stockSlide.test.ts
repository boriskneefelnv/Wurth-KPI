import { makePeriod } from "@/core/period";
import { computeReportSet } from "@/core/report/report";
import { stockSlide } from "@/core/slides/stock";
import { unit } from "./fixtures";

const units = [
  unit({ inslag: "2026-03-20", uitslag: "2026-04-30", uitgaandeRit: "R1", principal: "WIAG" }), // all of April
  unit({ inslag: "2026-04-15", uitgaandeRit: "R2", principal: "AWKG" }), // from the 15th, stays
  unit({ inslag: "2026-01-10", uitslag: "2026-02-10", uitgaandeRit: "R3", principal: "WIAG" }), // Q1 only
];

describe("stock slide model", () => {
  const m = stockSlide(computeReportSet(units, makePeriod("quarter", "2026-Q2"), ["previous"]));

  it("averages the stock per month with the principals as parts", () => {
    const apr = m.views.Total.buckets[0]!;
    expect(apr.label).toBe("Apr");
    expect(apr.avg).toBeCloseTo(29 / 30 + 16 / 30); // WIAG leaves at the end of the 30th
    expect(apr.parts!.find((p) => p.principal === "AWKG")!.avg).toBeCloseTo(16 / 30);
    expect(m.views.WIAG.buckets[0]!.parts).toBeNull();
  });

  it("gives the stock at the end, the highest point and the workdays of outbound", () => {
    expect(m.views.Total.end).toBe(1);
    expect(m.views.Total.peak).toEqual({ day: "2026-04-15", hus: 2 });
    expect(m.views.Total.workdaysOfStock).not.toBeNull();
    expect(m.comparisonLabel).toBe("vs Q1 2026");
  });
});
