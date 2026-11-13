import { makePeriod } from "@/core/period";
import { computeReportSet } from "@/core/report/report";
import { dailySlide } from "@/core/slides/daily";
import { times, unit } from "./fixtures";

// Q2 2026: WIAG and AWKG; Q1 2026: WIAG only.
const units = [
  ...times(6, (i) => unit({ inkomendeRit: `I${i}`, inslag: "2026-04-14", principal: "WIAG" })),
  ...times(4, (i) => unit({ uitgaandeRit: `U${i}`, uitslag: "2026-05-05", principal: "AWKG" })),
  ...times(5, (i) => unit({ inkomendeRit: `P${i}`, inslag: "2026-02-10", principal: "WIAG" })),
];

describe("daily workload slide model", () => {
  const set = computeReportSet(units, makePeriod("quarter", "2026-Q2"), ["previous"]);
  const m = dailySlide(set);

  it("has a view per principal and all principals, with the busiest day", () => {
    expect(m.order).toEqual(["Total", "WIAG", "AWKG", "Liqui Moly"]);
    expect(m.views.Total.peak).toMatchObject({ day: "2026-04-14", total: 6, label: "Tuesday 14 April" });
    expect(m.views.AWKG.peak).toMatchObject({ day: "2026-05-05", outbound: 4 });
    expect(m.views["Liqui Moly"].headline).toBe("No HUs handled in this period.");
  });

  it("explains growth from a principal that was not active in the comparison period", () => {
    expect(m.comparisonLabel).toBe("vs Q1 2026");
    expect(m.views.Total.headline).toContain("AWKG was not yet active in Q1 2026.");
    expect(m.views.Total.headline).not.toMatch(/[–—−]/);
  });

  it("lists workdays without gaps", () => {
    expect(m.days.every((d) => d.workday)).toBe(true);
    expect(m.days[0]!.day).toBe("2026-04-01");
  });
});
