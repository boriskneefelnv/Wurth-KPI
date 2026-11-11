import { periodOf } from "../dates";
import type { Direction, Period, Ride, Shipment } from "../types";
import { classifyDeviation, findWarehouseKeyword } from "./classify";
import type { Complaint, ComplaintMeta, MatchCandidate, MatchSource } from "./types";

/**
 * Two-level complaint matcher.
 *
 * Candidate numbers come from three sources, in priority order:
 *   1. AFAS Neele-Vat dossier numbers
 *   2. historical helpdesk (BlueJay) dossier
 *   3. 8–16 digit numbers in the complaint text
 * Sources are tried in that order and the first source with a WMS hit wins.
 * Within a source a shipment (dossier) hit beats a ride hit. Whether a number
 * is a dossier or a ride is decided by where it is found, never by its prefix.
 */

export function normalizeToken(raw: string): string | null {
  const t = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (t.length < 5 || /^0+$/.test(t)) return null;
  return t;
}

const TEXT_NUMBER_RE = /(?<!\d)\d{8,16}(?!\d)/g;
const SPLIT_RE = /[;,|/\s]+/;

type Source = Exclude<MatchSource, "manual">;

export function extractCandidates(c: Complaint): { source: Source; tokens: string[] }[] {
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => x !== null))];
  const fromList = (xs: string[]) => uniq(xs.flatMap((x) => x.split(SPLIT_RE)).map(normalizeToken));

  const afas = c.nvDossiernummers.length > 0 ? c.nvDossiernummers : c.nvDossiernummer ? [c.nvDossiernummer] : [];
  const text = [c.subject, c.reference, c.description].filter(Boolean).join(" ");
  return [
    { source: "afas_nv_dossiernummer" as const, tokens: fromList(afas) },
    { source: "hd_blujay_dossier" as const, tokens: fromList(c.hdBlujayDossier ? [c.hdBlujayDossier] : []) },
    { source: "regex_text" as const, tokens: uniq([...text.matchAll(TEXT_NUMBER_RE)].map((m) => normalizeToken(m[0]))) },
  ].filter((s) => s.tokens.length > 0);
}

export interface MatcherInput {
  complaints: readonly Complaint[];
  shipments: readonly Shipment[];
  rides: readonly Ride[];
  /** Existing classifications; manual decisions are preserved. */
  existing?: ReadonlyMap<number, ComplaintMeta>;
  /** Periods covered by the WMS import (for the "ride missing in WMS" warning). */
  wmsPeriods?: Iterable<Period>;
}

export type MatcherValidation =
  | { type: "shipment_ride_conflict"; severity: "warning"; klachtnr: number; dossiernummer: string; shipmentRide: string; conflictingRide: string }
  | { type: "ride_missing_in_wms"; severity: "warning"; klachtnr: number; period: Period; tokens: string[]; message: string };

export interface MatcherStats {
  processed: number;
  skippedManual: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  outOfScope: number;
  shipmentLinks: number;
  rideLinks: number;
  warehouse: number;
  /** Complaints previously linked to a ride that now link to a shipment. */
  upgrades: number;
  conflicts: number;
  /** Tokens without WMS hit, grouped by "first 4 digits / length". */
  unresolvedTokenGroups: Record<string, number>;
}

export interface MatcherResult {
  meta: ComplaintMeta[];
  stats: MatcherStats;
  validations: MatcherValidation[];
}

function baseMeta(klachtnr: number): ComplaintMeta {
  return {
    klachtnr,
    direction: null,
    directionSource: null,
    directionReason: null,
    includeInKpi: true,
    exclusionReason: null,
    dossiernummer: null,
    ritNummer: null,
    linkLevel: "none",
    matchStatus: "unmatched",
    matchSource: null,
    matchCandidates: [],
    huAffected: 1,
    huAffectedSource: "default_1",
    principal: null,
    period: null,
    salesVendor: null,
    salesVendorSource: null,
    deviation: null,
    deviationSource: null,
    notes: null,
  };
}

const isManualLink = (m: ComplaintMeta | undefined) => m?.matchSource === "manual" || m?.directionSource === "manual";

export function matchComplaints(input: MatcherInput): MatcherResult {
  const shipmentsByToken = new Map<string, Shipment[]>();
  for (const s of input.shipments) {
    const t = normalizeToken(s.dossiernummer);
    if (!t) continue;
    shipmentsByToken.set(t, [...(shipmentsByToken.get(t) ?? []), s]);
  }
  const ridesByToken = new Map<string, Ride[]>();
  for (const r of input.rides) {
    const t = normalizeToken(r.ritNummer);
    if (!t) continue;
    ridesByToken.set(t, [...(ridesByToken.get(t) ?? []), r]);
  }
  const wmsPeriods = new Set(input.wmsPeriods ?? []);

  const stats: MatcherStats = {
    processed: 0,
    skippedManual: 0,
    matched: 0,
    ambiguous: 0,
    unmatched: 0,
    outOfScope: 0,
    shipmentLinks: 0,
    rideLinks: 0,
    warehouse: 0,
    upgrades: 0,
    conflicts: 0,
    unresolvedTokenGroups: {},
  };
  const validations: MatcherValidation[] = [];
  const out: ComplaintMeta[] = [];

  for (const c of input.complaints) {
    stats.processed++;
    const prev = input.existing?.get(c.klachtnr);
    const meta = prev && isManualLink(prev) ? { ...prev } : baseMeta(c.klachtnr);

    // Fields owned by users survive re-matching.
    if (prev) {
      meta.includeInKpi = prev.includeInKpi;
      meta.exclusionReason = prev.exclusionReason;
      meta.notes = prev.notes;
      if (prev.huAffectedSource === "manual") {
        meta.huAffected = prev.huAffected;
        meta.huAffectedSource = "manual";
      }
    }

    // Sales/Vendor from AFAS unless set by hand.
    if (prev?.salesVendorSource === "manual") {
      meta.salesVendor = prev.salesVendor;
      meta.salesVendorSource = "manual";
    } else if (c.salesVendor) {
      meta.salesVendor = c.salesVendor;
      meta.salesVendorSource = "afas";
    }

    // Deviation by keywords unless set by hand.
    if (prev?.deviationSource === "manual") {
      meta.deviation = prev.deviation;
      meta.deviationSource = "manual";
    } else {
      meta.deviation = classifyDeviation(c);
      meta.deviationSource = meta.deviation ? "auto" : null;
    }

    if (prev && isManualLink(prev)) {
      stats.skippedManual++;
      out.push(meta);
      continue;
    }

    const sources = extractCandidates(c);
    const candidates: MatchCandidate[] = [];
    let decided = false;

    for (const { source, tokens } of sources) {
      const shipmentHits: Shipment[] = [];
      const rideHits: Ride[] = [];
      for (const token of tokens) {
        const sh = shipmentsByToken.get(token) ?? [];
        const rh = ridesByToken.get(token) ?? [];
        shipmentHits.push(...sh);
        rideHits.push(...rh);
        if (sh.length) for (const s of sh) candidates.push({ source, token, hit: "shipment", direction: s.direction });
        else if (rh.length) for (const r of rh) candidates.push({ source, token, hit: "ride", direction: r.direction });
        else candidates.push({ source, token, hit: null });
      }
      if (decided) continue; // keep collecting candidates for diagnostics
      meta.matchSource = source;

      if (shipmentHits.length > 0) {
        decided = true;
        meta.linkLevel = "shipment";
        const directions = new Set(shipmentHits.map((s) => s.direction));
        if (directions.size > 1) {
          Object.assign(meta, { matchStatus: "ambiguous", dossiernummer: shipmentHits[0]!.dossiernummer });
          stats.ambiguous++;
        } else {
          const s = shipmentHits[0]!;
          Object.assign(meta, {
            matchStatus: "matched_auto",
            direction: s.direction,
            directionSource: "auto_shipment",
            directionReason: `Dossier ${s.dossiernummer} gevonden in WMS (${s.direction})`,
            dossiernummer: s.dossiernummer,
            ritNummer: s.ritNummer,
            principal: s.principal,
            period: s.period,
          });
          stats.matched++;
          stats.shipmentLinks++;
          if (prev?.linkLevel === "ride") stats.upgrades++;
          const conflict = rideHits.find((r) => r.direction === s.direction && r.ritNummer !== s.ritNummer);
          if (conflict) {
            stats.conflicts++;
            validations.push({
              type: "shipment_ride_conflict",
              severity: "warning",
              klachtnr: c.klachtnr,
              dossiernummer: s.dossiernummer,
              shipmentRide: s.ritNummer,
              conflictingRide: conflict.ritNummer,
            });
          }
        }
      } else if (rideHits.length > 0) {
        decided = true;
        meta.linkLevel = "ride";
        const directions = new Set(rideHits.map((r) => r.direction));
        if (directions.size > 1) {
          Object.assign(meta, { matchStatus: "ambiguous", ritNummer: rideHits[0]!.ritNummer });
          stats.ambiguous++;
        } else {
          const r = rideHits[0]!;
          Object.assign(meta, {
            matchStatus: "matched_auto",
            direction: r.direction,
            directionSource: "auto_ride",
            directionReason: `Rit ${r.ritNummer} gevonden in WMS (${r.direction})`,
            ritNummer: r.ritNummer,
            principal: r.principals[0] ?? null,
            period: r.period,
          });
          stats.matched++;
          stats.rideLinks++;
        }
      }
    }
    meta.matchCandidates = candidates;

    if (!decided) {
      meta.matchSource = null;
      if (sources.length === 0) {
        meta.matchStatus = "unmatched";
        stats.unmatched++;
      } else {
        meta.matchStatus = "out_of_scope";
        stats.outOfScope++;
        const tokens = candidates.map((x) => x.token);
        for (const t of tokens) {
          const key = `${t.slice(0, 4)}…/${t.length}`;
          stats.unresolvedTokenGroups[key] = (stats.unresolvedTokenGroups[key] ?? 0) + 1;
        }
        const period = c.datumIncident ? periodOf(c.datumIncident) : null;
        if (period && wmsPeriods.has(period)) {
          validations.push({
            type: "ride_missing_in_wms",
            severity: "warning",
            klachtnr: c.klachtnr,
            period,
            tokens,
            message: `Klacht ${c.klachtnr} noemt ${tokens.join(", ")} maar die staan niet in de WMS-import van ${period}. Mogelijk is de WMS-export onvolledig.`,
          });
        }
      }
      const kw = findWarehouseKeyword(c);
      if (kw) {
        Object.assign(meta, { direction: "warehouse", directionSource: "auto_keyword", directionReason: `Trefwoord "${kw}"` });
        stats.warehouse++;
      }
    }
    out.push(meta);
  }

  return { meta: out, stats, validations };
}

export type { Direction };
