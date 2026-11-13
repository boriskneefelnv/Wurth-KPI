import { makePeriod } from "@/core/period";
import { computeReportSet } from "@/core/report/report";
import { worldMapSlide } from "@/core/slides/worldMap";
import { unit } from "./fixtures";

const units = [
  unit({ uitgaandeRit: "R1", uitslag: "2026-04-14", losLand: "AU", principal: "WIAG" }),
  unit({ uitgaandeRit: "R1", uitslag: "2026-04-14", losLand: "AU", principal: "AWKG" }),
  unit({ uitgaandeRit: "R1", uitslag: "2026-04-14", losLand: "NZ", principal: "AWKG" }), // same ride, second country
  unit({ uitgaandeRit: "R2", uitslag: "2026-05-05", losLand: "AU", principal: "WIAG" }),
  unit({ uitgaandeRit: "R3", uitslag: "2026-05-06", losLand: "ZA", principal: "Liqui Moly" }),
];

describe("outbound destinations worldwide", () => {
  const m = worldMapSlide(computeReportSet(units, makePeriod("quarter", "2026-Q2"), []));

  it("counts rides per country (a ride to two countries counts for both) and HUs", () => {
    const t = m.views.Total;
    expect(t.countries.map((c) => [c.country, c.rides, c.hus])).toEqual([["AU", 2, 3], ["NZ", 1, 1], ["ZA", 1, 1]]);
    expect(t.rides).toBe(3);
    expect(t.hus).toBe(5);
    expect(t.countries[0]!.perPrincipal).toEqual([{ principal: "WIAG", rides: 2, hus: 2 }, { principal: "AWKG", rides: 1, hus: 1 }]);
  });

  it("filters per principal", () => {
    expect(m.views.AWKG.countries.map((c) => [c.name, c.rides])).toEqual([["Australia", 1], ["New Zealand", 1]]);
    expect(m.views["Liqui Moly"].top.map((c) => c.name)).toEqual(["South Africa"]);
  });
});
