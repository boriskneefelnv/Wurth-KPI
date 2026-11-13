import { makePeriod } from "@/core/period";
import { computeReportSet } from "@/core/report/report";
import { destinationsSlide } from "@/core/slides/destinations";
import { times, unit } from "./fixtures";

const out = (rit: string, land: string, days: number, principal: "WIAG" | "AWKG" | "Liqui Moly" = "WIAG", day = "2026-04-14") =>
  unit({ uitgaandeRit: rit, uitslag: day, dagenInOpslag: days, losLand: land, principal });

const units = [
  ...times(12, (i) => out(`A${i}`, "AU", 20)),
  ...times(8, (i) => out(`Z${i}`, "ZA", 10, "AWKG")),
  ...times(6, (i) => out(`E${i}`, "AE", 50)),
  ...times(2, (i) => out(`K${i}`, "KR", 90)), // too small for "longest"
  ...times(10, (i) => out(`P${i}`, "AU", 30, "WIAG", "2026-02-10")), // previous quarter
];

describe("storage per destination slide model", () => {
  const set = computeReportSet(units, makePeriod("quarter", "2026-Q2"), ["previous"]);
  const m = destinationsSlide(set);
  const v = m.views.Total;

  it("ranks the destinations by HUs with their average days and last period's average", () => {
    expect(v.top.map((r) => [r.name, r.hus, r.avgDays])).toEqual([
      ["Australia", 12, 20],
      ["South Africa", 8, 10],
      ["United Arab Emirates", 6, 50],
      ["South Korea", 2, 90],
    ]);
    expect(v.top[0]!.ghostAvg).toBe(30);
    expect(v.countries).toBe(4);
  });

  it("names the longest storage among destinations with enough HUs", () => {
    expect(v.longest).toMatchObject({ name: "United Arab Emirates", avgDays: 50 });
    expect(v.shortest).toMatchObject({ name: "South Africa", avgDays: 10 });
    expect(v.headline).toBe("Australia was the largest destination with 12 HUs (43%), stored 20,0 days on average. Longest storage: United Arab Emirates, 50,0 days (6 HUs).");
    expect(m.views.AWKG.longest).toBeNull();
  });
});
