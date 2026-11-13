import { makePeriod } from "@/core/period";
import { computeReportSet } from "@/core/report/report";
import { containerMixSlide } from "@/core/slides/containerMix";
import { unit } from "./fixtures";

const ride = (rit: string, principal: "WIAG" | "AWKG" | "Liqui Moly", type: "LCL" | "AIR" | "FCA") =>
  unit({ uitgaandeRit: rit, uitslag: "2026-04-14", principal, shipmentType: type });

describe("container mix slide model", () => {
  const units = [ride("R1", "WIAG", "LCL"), ride("R2", "WIAG", "LCL"), ride("R3", "AWKG", "AIR"), ride("R4", "Liqui Moly", "FCA")];
  const m = containerMixSlide(computeReportSet(units, makePeriod("quarter", "2026-Q2"), []));

  it("counts containers (rides) per type, split by principal, without empty types", () => {
    const t = m.views.Total;
    expect(t.rides).toBe(4);
    expect(t.rows.map((r) => [r.code, r.rides])).toEqual([["LCL", 2], ["AIR", 1], ["FCA", 1]]);
    expect(t.rows[0]!.parts).toEqual([{ principal: "WIAG", rides: 2 }]);
    expect(t.lclShare).toBe(50);
    expect(t.teu).toBe(0);
  });

  it("filters per principal", () => {
    expect(m.views.AWKG.rows.map((r) => r.label)).toEqual(["Air freight"]);
    expect(m.views.AWKG.rows[0]!.parts).toBeNull();
  });
});
