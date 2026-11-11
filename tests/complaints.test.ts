import { parseDateValue } from "@/core/dates";
import { classifyDeviation } from "@/core/complaints/classify";
import { computeComplaintKpi, type KpiComplaint } from "@/core/complaints/kpi";
import { extractCandidates, matchComplaints, normalizeToken } from "@/core/complaints/matcher";
import type { Complaint, ComplaintMeta } from "@/core/complaints/types";
import type { Ride, Shipment } from "@/core/types";

const complaint = (c: Partial<Complaint> & { klachtnr: number }): Complaint => ({
  datumIncident: parseDateValue("2026-04-10"),
  subject: null,
  reference: null,
  description: null,
  complaintType: null,
  nvDossiernummer: null,
  nvDossiernummers: [],
  hdBlujayDossier: null,
  ...c,
});

const ride = (r: Partial<Ride> & Pick<Ride, "direction" | "ritNummer">): Ride => ({
  canonicalDate: "2026-04-02",
  scanDate: "2026-04-02",
  plannedUnits: null,
  listStatus: "no-list",
  period: "2026-04",
  dateResolution: "single",
  outlierHuCount: 0,
  huCount: 10,
  shipmentCount: 1,
  principals: ["WIAG"],
  huByPrincipal: { WIAG: r.huCount ?? 10 },
  ...r,
});

const shipment = (s: Partial<Shipment> & Pick<Shipment, "direction" | "dossiernummer" | "ritNummer">): Shipment => ({
  referentie: null,
  period: "2026-04",
  ownDate: "2026-04-02",
  huCount: 5,
  principal: "WIAG",
  ...s,
});

const rides = [
  ride({ direction: "outbound", ritNummer: "70001234" }),
  ride({ direction: "inbound", ritNummer: "60005555" }),
  ride({ direction: "outbound", ritNummer: "70009999" }),
];
const shipments = [
  shipment({ direction: "outbound", dossiernummer: "12345678", ritNummer: "70001234" }),
  shipment({ direction: "outbound", dossiernummer: "55555555", ritNummer: "70009999" }),
  shipment({ direction: "inbound", dossiernummer: "55555555", ritNummer: "60005555" }),
];

const match = (cs: Complaint[], existing?: Map<number, ComplaintMeta>) =>
  matchComplaints({ complaints: cs, shipments, rides, existing, wmsPeriods: ["2026-04"] });

describe("candidates", () => {
  it("normalises tokens and drops short/zero tokens", () => {
    expect(normalizeToken(" nv-1234.5678 ")).toBe("NV12345678");
    expect(normalizeToken("1234")).toBeNull();
    expect(normalizeToken("000000")).toBeNull();
  });

  it("extracts per source in priority order", () => {
    const c = complaint({
      klachtnr: 1,
      nvDossiernummer: "12345678; 87654321",
      hdBlujayDossier: "HD-99999",
      description: "rit 70001234 en ref 123",
    });
    expect(extractCandidates(c)).toEqual([
      { source: "afas_nv_dossiernummer", tokens: ["12345678", "87654321"] },
      { source: "hd_blujay_dossier", tokens: ["HD99999"] },
      { source: "regex_text", tokens: ["70001234"] },
    ]);
  });
});

describe("matcher", () => {
  it("links to a shipment and takes direction, ride, principal and period from it", () => {
    const { meta, stats } = match([complaint({ klachtnr: 1, nvDossiernummers: ["12345678"] })]);
    expect(meta[0]).toMatchObject({
      matchStatus: "matched_auto",
      linkLevel: "shipment",
      matchSource: "afas_nv_dossiernummer",
      direction: "outbound",
      directionSource: "auto_shipment",
      dossiernummer: "12345678",
      ritNummer: "70001234",
      period: "2026-04",
      huAffected: 1,
      huAffectedSource: "default_1",
    });
    expect(stats).toMatchObject({ matched: 1, shipmentLinks: 1 });
  });

  it("within one source a shipment hit beats a ride hit", () => {
    const { meta } = match([complaint({ klachtnr: 1, description: "rit 70009999 dossier 12345678" })]);
    expect(meta[0]).toMatchObject({ linkLevel: "shipment", dossiernummer: "12345678", matchSource: "regex_text" });
  });

  it("a higher-priority source's ride hit beats a lower source's shipment hit", () => {
    const { meta } = match([complaint({ klachtnr: 1, hdBlujayDossier: "70001234", description: "dossier 12345678" })]);
    expect(meta[0]).toMatchObject({ linkLevel: "ride", ritNummer: "70001234", matchSource: "hd_blujay_dossier", directionSource: "auto_ride" });
  });

  it("falls through to the next source when a source has no hits", () => {
    const { meta } = match([complaint({ klachtnr: 1, nvDossiernummers: ["99999999"], description: "12345678" })]);
    expect(meta[0]).toMatchObject({ matchStatus: "matched_auto", matchSource: "regex_text" });
    expect(meta[0]!.matchCandidates.map((c) => [c.source, c.hit])).toEqual([
      ["afas_nv_dossiernummer", null],
      ["regex_text", "shipment"],
    ]);
  });

  it("marks shipment hits in both directions as ambiguous", () => {
    const { meta, stats } = match([complaint({ klachtnr: 1, nvDossiernummers: ["55555555"] })]);
    expect(meta[0]).toMatchObject({ matchStatus: "ambiguous", linkLevel: "shipment", direction: null, ritNummer: null });
    expect(stats.ambiguous).toBe(1);
  });

  it("distinguishes unmatched (no number) from out of scope (number not in WMS)", () => {
    const { meta, validations } = match([
      complaint({ klachtnr: 1, description: "Doos kapot" }),
      complaint({ klachtnr: 2, description: "zie 11112222" }),
    ]);
    expect(meta.map((m) => [m.matchStatus, m.linkLevel])).toEqual([
      ["unmatched", "none"],
      ["out_of_scope", "none"],
    ]);
    expect(validations).toEqual([expect.objectContaining({ type: "ride_missing_in_wms", klachtnr: 2, tokens: ["11112222"] })]);
  });

  it("assigns warehouse direction by keyword only when nothing matched", () => {
    const { meta } = match([
      complaint({ klachtnr: 1, subject: "Verkeerd label op doos" }),
      complaint({ klachtnr: 2, subject: "Verkeerd label", nvDossiernummers: ["12345678"] }),
    ]);
    expect(meta[0]).toMatchObject({ direction: "warehouse", directionSource: "auto_keyword" });
    expect(meta[1]).toMatchObject({ direction: "outbound" });
  });

  it("does not see keywords inside other words", () => {
    const { meta } = match([complaint({ klachtnr: 1, subject: "Whatsapp bericht" })]);
    expect(meta[0]!.direction).toBeNull();
  });

  it("warns when a shipment's ride conflicts with a ride mentioned in the same source", () => {
    const { validations, stats } = match([complaint({ klachtnr: 1, description: "12345678 / 70009999" })]);
    expect(stats.conflicts).toBe(1);
    expect(validations[0]).toMatchObject({ type: "shipment_ride_conflict", shipmentRide: "70001234", conflictingRide: "70009999" });
  });

  it("keeps manual links and user-owned fields", () => {
    const prev: ComplaintMeta = {
      ...match([complaint({ klachtnr: 1 })]).meta[0]!,
      matchStatus: "matched_manual",
      matchSource: "manual",
      linkLevel: "ride",
      ritNummer: "70009999",
      direction: "outbound",
      includeInKpi: false,
      exclusionReason: "Dubbel",
      huAffected: 4,
      huAffectedSource: "manual",
    };
    const { meta, stats } = match([complaint({ klachtnr: 1, nvDossiernummers: ["12345678"] })], new Map([[1, prev]]));
    expect(stats.skippedManual).toBe(1);
    expect(meta[0]).toMatchObject({ ritNummer: "70009999", includeInKpi: false, huAffected: 4 });
  });

  it("keeps a manual exclusion when re-matching automatically", () => {
    const first = match([complaint({ klachtnr: 1, nvDossiernummers: ["12345678"] })]).meta[0]!;
    const prev = { ...first, includeInKpi: false, exclusionReason: "Geen Würth" };
    const { meta } = match([complaint({ klachtnr: 1, nvDossiernummers: ["12345678"] })], new Map([[1, prev]]));
    expect(meta[0]).toMatchObject({ matchStatus: "matched_auto", includeInKpi: false, exclusionReason: "Geen Würth" });
  });
});

describe("deviation classification", () => {
  it("applies the order Damage → Wrong quantity → Stowing → Communication", () => {
    const d = (description: string) => classifyDeviation(complaint({ klachtnr: 1, description }));
    expect(d("Pallet beschadigd en manco van 2 dozen")).toBe("Damage");
    expect(d("Manco van 2 dozen")).toBe("Wrong quantity");
    expect(d("Lading verschoven tijdens transport")).toBe("Stowing");
    expect(d("Klant niet geïnformeerd over vertraging")).toBe("Communication error");
    expect(d("Overig probleem")).toBeNull();
  });
});

describe("complaint KPI", () => {
  const kpiRides = [
    ride({ direction: "outbound", ritNummer: "A", huCount: 10, principals: ["WIAG"], huByPrincipal: { WIAG: 10 } }),
    ride({ direction: "outbound", ritNummer: "B", huCount: 4, principals: ["WIAG", "AWKG"], huByPrincipal: { WIAG: 2, AWKG: 2 } }),
    ride({ direction: "outbound", ritNummer: "C", huCount: 6, excludedFromReport: true }),
    ride({ direction: "outbound", ritNummer: "D", huCount: 5, period: "2026-03" }),
  ];
  const kpiShipments = [
    shipment({ direction: "outbound", dossiernummer: "S1", ritNummer: "A", huCount: 3 }),
    shipment({ direction: "outbound", dossiernummer: "S2", ritNummer: "A", huCount: 7 }),
    shipment({ direction: "outbound", dossiernummer: "S3", ritNummer: "B", huCount: 4, principal: "AWKG" }),
    shipment({ direction: "outbound", dossiernummer: "S4", ritNummer: "C", huCount: 6 }),
  ];
  const meta = (m: Partial<KpiComplaint> & { klachtnr: number }): KpiComplaint => ({
    ...match([complaint({ klachtnr: m.klachtnr })]).meta[0]!,
    matchStatus: "matched_auto",
    direction: "outbound",
    principal: "WIAG",
    period: "2026-04",
    incidentPeriod: "2026-04",
    ...m,
  });
  const run = (complaints: KpiComplaint[]) =>
    computeComplaintKpi({ rides: kpiRides, shipments: kpiShipments, complaints, periods: ["2026-04"] }).outbound;

  it("returns complaint-free percentages and null without denominator", () => {
    const r = run([]).total;
    expect(r.rides).toMatchObject({ total: 2, affected: 0, pct: 100, meetsTarget: true });
    expect(r.hus.total).toBe(14);
    const inbound = computeComplaintKpi({ rides: kpiRides, shipments: kpiShipments, complaints: [], periods: ["2026-04"] }).inbound.total;
    expect(inbound.rides.pct).toBeNull();
    expect(inbound.rides.meetsTarget).toBeNull();
  });

  it("dedupes rides, caps HUs per shipment and per ride, counts ride-level complaints as unassignable", () => {
    const r = run([
      meta({ klachtnr: 1, linkLevel: "shipment", dossiernummer: "S1", ritNummer: "A", huAffected: 5 }), // capped to 3
      meta({ klachtnr: 2, linkLevel: "shipment", dossiernummer: "S1", ritNummer: "A", huAffected: 1 }),
      meta({ klachtnr: 3, linkLevel: "ride", ritNummer: "A", huAffected: 9 }), // 3 + 9 → capped at ride's 10
      meta({ klachtnr: 4, linkLevel: "ride", ritNummer: "C" }), // excluded ride
    ]).total;
    expect(r.rides).toMatchObject({ total: 2, affected: 1, pct: 50 });
    expect(r.shipments).toMatchObject({ total: 3, affected: 1, unassignable: 1 });
    expect(r.hus).toMatchObject({ total: 14, affected: 10 });
    expect(r.complaintCount).toBe(3);
  });

  it("uses the unrounded ratio for meetsTarget", () => {
    const manyRides = Array.from({ length: 1999 }, (_, i) => ride({ direction: "outbound", ritNummer: `R${i}`, huCount: 1 }));
    // 1999 rides, 100 affected → 94.997…% (rounds to 95.0) but misses target
    const cs = Array.from({ length: 100 }, (_, i) => meta({ klachtnr: i + 1, linkLevel: "ride", ritNummer: `R${i}` }));
    const r = computeComplaintKpi({ rides: manyRides, shipments: [], complaints: cs, periods: ["2026-04"] }).outbound.total.rides;
    expect(r.pct!.toFixed(1)).toBe("95.0");
    expect(r.meetsTarget).toBe(false);
  });

  it("splits views, exclusions, unlinked, ambiguous and deviations", () => {
    const out = run([
      meta({ klachtnr: 1, linkLevel: "ride", ritNummer: "A", salesVendor: "sales", deviation: "Damage" }),
      meta({ klachtnr: 2, linkLevel: "ride", ritNummer: "B", salesVendor: "vendor" }),
      meta({ klachtnr: 3, linkLevel: "ride", ritNummer: "B", includeInKpi: false, exclusionReason: "Dubbel" }),
      meta({ klachtnr: 4, matchStatus: "out_of_scope", linkLevel: "none", direction: null, period: null }),
      meta({ klachtnr: 5, matchStatus: "ambiguous", linkLevel: "shipment", direction: null }),
    ]);
    expect(out.sales.rides.affected).toBe(1);
    expect(out.vendor.rides.affected).toBe(1);
    expect(out.total.rides.affected).toBe(2);
    expect(out.total.excluded).toEqual({ count: 1, byReason: { Dubbel: 1 } });
    expect(out.total.unlinked).toBe(1);
    expect(out.total.ambiguous).toBe(1);
    expect(out.total.deviations).toEqual([
      { deviation: "Damage", complaints: 1, hus: 1 },
      { deviation: "Not categorized", complaints: 1, hus: 1 },
    ]);
  });

  it("computes per-principal performance against that principal's rides and HUs", () => {
    const out = run([meta({ klachtnr: 1, linkLevel: "shipment", dossiernummer: "S3", ritNummer: "B", principal: "AWKG", huAffected: 3 })]);
    const awkg = out.total.perPrincipal.AWKG;
    expect(awkg.rides).toMatchObject({ total: 1, affected: 1, pct: 0 });
    expect(awkg.hus).toMatchObject({ total: 2, affected: 2 });
    expect(out.total.perPrincipal.WIAG.rides.affected).toBe(0);
  });

  it("counts warehouse complaints by incident month", () => {
    const k = computeComplaintKpi({
      rides: kpiRides,
      shipments: kpiShipments,
      periods: ["2026-04"],
      complaints: [
        meta({ klachtnr: 1, direction: "warehouse", matchStatus: "unmatched", linkLevel: "none" }),
        meta({ klachtnr: 2, direction: "warehouse", matchStatus: "unmatched", linkLevel: "none", incidentPeriod: "2026-03" }),
      ],
    });
    expect(k.warehouse).toEqual({ total: 1, perPeriod: { "2026-04": 1 } });
  });
});
