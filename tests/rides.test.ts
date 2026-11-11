import { parseDateValue } from "@/core/dates";
import { materializeRides, resolveRideDate } from "@/core/wms/rides";
import { times, unit } from "./fixtures";

const dates = (spec: [string, number][]) => spec.flatMap(([d, n]) => times(n, () => parseDateValue(d)));

describe("resolveRideDate (5% rule)", () => {
  it("returns null without dated HUs", () => {
    expect(resolveRideDate([null, undefined])).toBeNull();
  });

  it("single day → single", () => {
    expect(resolveRideDate(dates([["2026-04-03 08:00", 3]]))).toMatchObject({
      canonicalDate: "2026-04-03",
      resolution: "single",
      outlierHuCount: 0,
    });
  });

  it("skips a newest tail below 5%", () => {
    const r = resolveRideDate(dates([["2026-04-04", 2], ["2026-04-03", 98]]))!;
    expect(r.canonicalDate).toBe("2026-04-03");
    expect(r.resolution).toBe("majority_5pct");
    expect(r.skippedNewerHuCount).toBe(2);
    expect(r.outlierHuCount).toBe(2);
  });

  it("takes the newest day once it reaches 5%", () => {
    expect(resolveRideDate(dates([["2026-04-04", 5], ["2026-04-03", 95]]))!.canonicalDate).toBe("2026-04-04");
  });

  it("counts older HUs as outliers too", () => {
    const r = resolveRideDate(dates([["2026-04-05", 1], ["2026-04-04", 60], ["2026-04-01", 39]]))!;
    expect(r.canonicalDate).toBe("2026-04-04");
    expect(r.skippedNewerHuCount).toBe(1);
    expect(r.outlierHuCount).toBe(40);
  });

  it("uses dated HUs as the denominator", () => {
    // 1 of 10 dated HUs (10%) on the newest day → newest day wins despite many undated HUs.
    const r = resolveRideDate([...dates([["2026-04-04", 1], ["2026-04-03", 9]]), ...times(90, () => null)])!;
    expect(r.canonicalDate).toBe("2026-04-04");
  });

  it("assigns the period of the canonical day across a month boundary", () => {
    expect(resolveRideDate(dates([["2026-05-01", 1], ["2026-04-30", 40]]))!.period).toBe("2026-04");
  });
});

describe("materializeRides", () => {
  it("builds rides and shipments per direction", () => {
    const units = [
      unit({ uitgaandeRit: "R1", dossiernummer: "D1", uitslag: "2026-04-03", principal: "WIAG" }),
      unit({ uitgaandeRit: "R1", dossiernummer: "D1", uitslag: "2026-04-03", principal: "WIAG" }),
      unit({ uitgaandeRit: "R1", dossiernummer: "D2", uitslag: "2026-04-03", principal: "Liqui Moly" }),
      unit({ inkomendeRit: "I1", dossiernummer: "D9", inslag: "2026-03-01" }),
      unit({ uitgaandeRit: "R2", dossiernummer: "D3" }), // no outbound date
    ];
    const { rides, shipments, undatedRides } = materializeRides(units);
    const r1 = rides.find((r) => r.ritNummer === "R1")!;
    expect(r1).toMatchObject({
      direction: "outbound",
      huCount: 3,
      shipmentCount: 2,
      principals: ["WIAG", "Liqui Moly"],
      huByPrincipal: { WIAG: 2, "Liqui Moly": 1 },
      period: "2026-04",
    });
    expect(rides.find((r) => r.ritNummer === "I1")!.direction).toBe("inbound");
    expect(undatedRides).toEqual([{ direction: "outbound", ritNummer: "R2", huCount: 1 }]);
    expect(shipments.filter((s) => s.direction === "outbound").map((s) => [s.dossiernummer, s.ritNummer, s.huCount])).toEqual([
      ["D1", "R1", 2],
      ["D2", "R1", 1],
    ]);
  });
});
