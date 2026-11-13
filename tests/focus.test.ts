import { makePeriod } from "@/core/period";
import { focusOn } from "@/core/report/focus";
import { computeReportSet } from "@/core/report/report";
import { materializeRides } from "@/core/wms/rides";
import { unit } from "./fixtures";

describe("one entity", () => {
  const units = [
    unit({ uitgaandeRit: "R1", uitslag: "2026-04-14", principal: "WIAG" }),
    unit({ uitgaandeRit: "R1", uitslag: "2026-04-14", principal: "AWKG" }),
    unit({ uitgaandeRit: "R1", uitslag: "2026-04-14", principal: "AWKG" }),
    unit({ uitgaandeRit: "R2", uitslag: "2026-04-15", principal: "AWKG" }),
  ];
  const { rides } = materializeRides(units);
  const f = focusOn(units, rides, "WIAG");

  it("keeps only the entity's HUs and the rides that carry them", () => {
    expect(f.units).toHaveLength(1);
    expect(f.rides.map((r) => [r.ritNummer, r.principals, r.huCount])).toEqual([["R1", ["WIAG"], 1]]);
  });

  it("reports the entity as all principals", () => {
    const set = computeReportSet(f.units, makePeriod("quarter", "2026-Q2"), [], {}, f.rides);
    const v = set.current.perspectives;
    expect(v.hus.volume.outbound.Total.total).toBe(1);
    expect(v.rides.volume.outbound.Total.total).toBe(1);
    expect(v.hus.volume.outbound.AWKG.total).toBe(0);
  });
});
