/**
 * Renders the volume slide (design A) with synthetic data to an HTML file, for
 * design review before the React app exists.
 *
 *   npx tsx scripts/preview-volume.ts <out-dir>
 *
 * The data is generated (seeded), NOT real Würth data.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makePeriod, eachDay, isWorkday } from "../src/core/period";
import { computeReportSet } from "../src/core/report/report";
import { buildDeck } from "../src/deck/deck";
import { deckDocument, renderSlidesStatic } from "../src/deck/exportHtml";
import { loadDeckAssets } from "./lib/brand";
import { parseDateValue, periodOf } from "../src/core/dates";
import { storageBucket } from "../src/core/wms/enrich";
import type { Principal, WmsUnit } from "../src/core/types";

// ---------------------------------------------------------------------------
// Synthetic data
// ---------------------------------------------------------------------------

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;

function syntheticUnits(): WmsUnit[] {
  const units: WmsUnit[] = [];
  let ride = 1000;
  let row = 2;
  const countries = ["DE", "DE", "DE", "AT", "CH", "FR", "IT", "NL", "BE", "PL"];
  const profile: Record<Exclude<Principal, "Overig">, { out: number; in: number; growth: number }> = {
    WIAG: { out: 0.55, in: 0.35, growth: 1.12 },
    AWKG: { out: 0.4, in: 0.25, growth: 0.97 },
    "Liqui Moly": { out: 0.25, in: 0.15, growth: 1.3 },
  };
  for (const day of eachDay({ from: "2025-04-01", to: "2026-06-30" })) {
    if (!isWorkday(day)) continue;
    const yearFactor = day >= "2026-01-01" ? 1 : 0;
    for (const [p, cfg] of Object.entries(profile) as [Exclude<Principal, "Overig">, (typeof profile)["WIAG"]][]) {
      const growth = yearFactor ? cfg.growth : 1;
      const season = day.slice(5, 7) === "06" ? 1.25 : 1;
      if (rnd() < cfg.out * growth * season) {
        const rit = `7${ride++}`;
        const country = p === "WIAG" && day >= "2026-05-01" && rnd() < 0.4 ? "FR" : pick(countries);
        const n = 14 + Math.floor(rnd() * 20);
        for (let i = 0; i < n; i++) {
          const dagen = Math.floor(rnd() * 70);
          const out = parseDateValue(`${day} 1${Math.floor(rnd() * 8)}:00`)!;
          const inslag = new Date(out.getTime() - dagen * 86_400_000);
          units.push(unitOf({ row: row++, p, uitgaandeRit: rit, inslag, out, country, dagen }));
        }
      }
      if (rnd() < cfg.in * growth) {
        const rit = `6${ride++}`;
        const n = 30 + Math.floor(rnd() * 30);
        for (let i = 0; i < n; i++) {
          units.push(unitOf({ row: row++, p, inkomendeRit: rit, inslag: parseDateValue(`${day} 09:00`)!, out: null, country: null, dagen: null }));
        }
      }
    }
  }
  return units;
}

function unitOf(o: {
  row: number;
  p: Principal;
  uitgaandeRit?: string;
  inkomendeRit?: string;
  inslag: Date;
  out: Date | null;
  country: string | null;
  dagen: number | null;
}): WmsUnit {
  return {
    rowIndex: o.row,
    sscc: "",
    referentie: "",
    dossiernummer: `D${o.row >> 3}`,
    inkomendeRit: o.inkomendeRit ?? null,
    uitgaandeRit: o.uitgaandeRit ?? null,
    omschrijving: "Geladen",
    status: "geladen",
    opdrachtgever: o.p,
    principal: o.p,
    containertype: "40HC",
    seals: ["", "", ""],
    shipmentType: o.out ? "40H" : null,
    brutoKg: 300,
    laaddatum: o.out,
    vertrek: o.out,
    losdatum: o.inkomendeRit ? o.inslag : null,
    inslagUnit: o.inslag,
    uitslagUnit: o.out,
    losLand: o.country,
    afzenderLand: "DE",
    dagenInOpslag: o.dagen,
    storageBucket: o.dagen === null ? null : storageBucket(o.dagen),
    inboundPeriod: periodOf(o.inslag),
    outboundPeriod: o.out ? periodOf(o.out) : null,
  };
}

const outDir = process.argv[2] ?? "preview";
mkdirSync(outDir, { recursive: true });
const units = syntheticUnits();
const q2 = makePeriod("quarter", "2026-Q2");
const set = computeReportSet(units, q2, ["previous", "lastYear"]);
const deck = buildDeck(set, new Date());
writeFileSync(join(outDir, "deck.html"), deckDocument(renderSlidesStatic(deck, loadDeckAssets()), "Deck preview (synthetic data)"));
console.log(join(outDir, "deck.html"));
