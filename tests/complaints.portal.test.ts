import { categorize, isComplaintsExport, parseComplaints, principalFromCustomer } from "@/core/complaints/portal";
import { makePeriod } from "@/core/period";
import { computeReportSet } from "@/core/report/report";
import { materializeRides } from "@/core/wms/rides";
import { times, unit } from "./fixtures";

const HEAD = ["Klachtnr", "Datum incident", "Onderwerp", "Klantnaam AFAS", "HD: Blujay dossier", "HD: Pallets", "HD: Sales/Vendor", "HD: Accepted/Denied", "HD: Financiële impact", "Schadebedrag", "Status AFAS"];
const sheet = (rows: unknown[][]) => [{ name: "Klachten", rows: [HEAD, ...rows] }];

describe("complaints portal export", () => {
  it("is recognised and parsed", () => {
    const s = sheet([[3599, "2026-03-24", "Onjuist gestuwd 266500004376", "Würth Logistics AG", "266500004376", 11, "Vendor", "Accepted", 0, "", "Legal"]]);
    expect(isComplaintsExport(s)).toBe(true);
    expect(parseComplaints(s)[0]).toMatchObject({ klachtnr: 3599, incidentDay: "2026-03-24", principal: "WIAG", origin: "vendor", verdict: "accepted", pallets: 11, category: "Stowing", rideTokens: ["266500004376"] });
  });

  it("maps customers and categories", () => {
    expect(principalFromCustomer("Adolf Würth GmbH & Co. KG")).toBe("AWKG");
    expect(principalFromCustomer("Würth Logistics Bremen GmbH")).toBe("AWKG");
    expect(principalFromCustomer("Liqui Moly GmbH")).toBe("Liqui Moly");
    expect(categorize("Pallet verkeerd gelabeld (batterijen)")).toBe("Dangerous goods and labels");
    expect(categorize("Schade tijdens laden 266500004440")).toBe("Damage");
    expect(categorize("Pallet niet geladen / 266500005005")).toBe("Missing or not loaded");
    expect(categorize("Verkeerde looplijst aan chauffeur gegeven")).toBe("Process and documents");
  });
});

describe("complaint KPIs", () => {
  // 10 outbound rides of 2 HUs in April; complaint on R0 (1 pallet), a denied one on R1, one without ride.
  const units = times(10, (i) => [unit({ uitgaandeRit: `26650000000${i}`, uitslag: "2026-04-14", principal: "WIAG" }), unit({ uitgaandeRit: `26650000000${i}`, uitslag: "2026-04-14", principal: "WIAG" })]).flat();
  const complaints = parseComplaints(
    sheet([
      [1, "2026-04-15", "Schade 266500000000", "Würth Logistics AG", "", 1, "Sales", "Accepted", "", "", ""],
      [2, "2026-04-15", "Schade 266500000001", "Würth Logistics AG", "", 2, "Vendor", "Denied", "", "", ""],
      [3, "2026-04-20", "Geen batterijen label", "Adolf Würth GmbH & Co. KG", "5002536424", "", "", "", "", "", ""],
    ]),
  );
  const { rides } = materializeRides(units);
  const set = computeReportSet(units, makePeriod("quarter", "2026-Q2"), [], {}, rides, complaints);
  const b = set.current.complaints!;

  it("counts rides and HUs without complaint, denied complaints excluded", () => {
    expect(b.kpi.Total.rides).toEqual({ total: 10, affected: 1, pct: 90 });
    expect(b.kpi.Total.hus).toEqual({ total: 20, affected: 1, pct: 95 });
    expect(b.kpi.Total.perBucket[0]!.rides.affected).toBe(1);
  });

  it("keeps complaints without a ride as warehouse complaints", () => {
    expect(b.items.map((i) => [i.klachtnr, i.direction, i.counted])).toEqual([
      [1, "outbound", true],
      [2, "outbound", false],
      [3, "warehouse", true],
    ]);
    expect(b.kpi.AWKG.rides.affected).toBe(0);
  });
});
