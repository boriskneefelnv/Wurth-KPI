/**
 * Runs the full pipeline on real WMS exports and prints the reconciliation;
 * renders the volume slides to HTML.
 *
 *   npx tsx scripts/analyse.ts --units <Unit_overzicht.xlsx> --laden <Te_laden.xlsx> --lossen <Te_lossen.xlsx> \
 *     --period quarter:2026-Q2 [--compare previous,lastYear] [--out <dir>]
 *
 * Exports contain customer data: keep them in data/ (git-ignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  availableComparisons,
  availablePeriods,
  makePeriod,
  REPORT_KINDS,
  type ComparisonKind,
  type ReportKind,
} from "../src/core/period";
import { reconcileRideLists, reconcileVolume } from "../src/core/report/reconcile";
import { computeReportSet } from "../src/core/report/report";
import { volumeSlide, type VolumeSlideSubject } from "../src/core/slides/volume";
import { parseWmsSheets } from "../src/core/wms/excel";
import { enrichWms } from "../src/core/wms/enrich";
import { coverageFromRideLists, indexPlannedRides, parseRideList } from "../src/core/wms/rideLists";
import { materializeRides } from "../src/core/wms/rides";
import { readXlsx } from "../src/core/wms/xlsxReader";
import { renderVolumeSlide, volumeDocument } from "./lib/renderVolume";

const { values: args } = parseArgs({
  options: {
    units: { type: "string" },
    laden: { type: "string" },
    lossen: { type: "string" },
    period: { type: "string", default: "half:2026-H1" },
    compare: { type: "string", default: "" },
    out: { type: "string" },
  },
});
if (!args.units || !args.laden || !args.lossen) throw new Error("--units, --laden en --lossen zijn verplicht");

const read = async (f: string) => readXlsx(new Uint8Array(readFileSync(f)));
const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);
const n = (x: number) => x.toLocaleString("nl-NL");

const enriched = enrichWms(parseWmsSheets(await read(args.units)));
const lists = [parseRideList(await read(args.laden)), parseRideList(await read(args.lossen))];
const planned = indexPlannedRides(lists);
const { rides, listOnlyRides } = materializeRides(enriched.units, { planned });
const coverage = coverageFromRideLists(lists);

const v = enriched.validation;
console.log(`UNITOVERZICHT  ${n(v.rawCount)} rijen → ${n(v.acceptedCount)} meegeteld, ${n(v.rejected.length)} afgekeurd`);
const byReason: Record<string, number> = {};
for (const r of v.rejected) byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
console.log("  afgekeurd per reden:", byReason, " statussen:", v.excludedStatuses);
console.log("  onbekende opdrachtgevers (→ Overig):", v.unknownPrincipals);
console.log("  negatieve opslagduur (rij behouden, opslagduur leeg):", v.negativeStorage.length);
for (const l of lists) {
  console.log(`RITTENLIJST ${l.direction}  ${n(l.rawRowCount)} regels → ${n(l.rides.length)} ritten, datums ${l.dateRange?.from} t/m ${l.dateRange?.to}`);
}
console.log(`DEKKING (uit rittenlijsten)  ${coverage?.from} t/m ${coverage?.to}`);
for (const kind of REPORT_KINDS) console.log(`  ${kind}: ${availablePeriods(kind, coverage).map((p) => p.key).join(", ") || "—"}`);
console.log(`Ritten alleen op lijst (geen HU's in unitoverzicht): ${listOnlyRides.length}`);

const [kind, key] = args.period.split(":") as [ReportKind, string];
const period = makePeriod(kind, key);
const requested = (args.compare ? args.compare.split(",") : []) as ComparisonKind[];
const allowed = availableComparisons(period, coverage);
const comparisons = requested.filter((c) => allowed.includes(c));
console.log(`\nRAPPORT ${period.label}  vergelijkingen mogelijk: ${allowed.join(", ") || "geen"}; gebruikt: ${comparisons.join(", ") || "geen"}`);

const recList = reconcileRideLists(enriched.units, planned, rides, period);
const recVol = reconcileVolume(enriched.units, v.rejected, rides, period);
for (const dir of ["inbound", "outbound"] as const) {
  const r = recList[dir];
  const rv = recVol[dir];
  console.log(`\n== ${dir.toUpperCase()}`);
  console.log(`  rittenlijst: ${n(r.listRides)} ritten, ${n(r.listUnits)} units  (genegeerd: test ${r.ignored.test.rides}/${r.ignored.test.units}u, cancel ${r.ignored.cancelled.rides}, leeg ${r.ignored.empty}; niet afgerond ${r.notCompleted.rides} ritten/${r.notCompleted.units}u ${JSON.stringify(r.notCompleted.statuses)})`);
  console.log(`  in unitoverzicht: ${n(r.matchedRides)} ritten, ${n(r.matchedUnitFileHus)} HU's (lijst zegt ${n(r.matchedListUnits)})  → volledigheid ${pct(r.completeness)}`);
  console.log(`  ontbreekt in unitoverzicht: ${n(r.missingInUnitFile.rides)} ritten, ${n(r.missingInUnitFile.units)} units`);
  console.log(`  niet op lijst: ${n(r.notOnList.rides)} ritten, ${n(r.notOnList.hus)} HU's`);
  console.log(`  datum lijst vs scans: zelfde dag ${r.dateAgreement.sameDay}, ±1 dag ${r.dateAgreement.withinOneDay}, andere maand ${r.dateAgreement.otherMonth} (van ${r.matchedRides})`);
  console.log(`  per staaf: ${r.perBucket.map((b) => `${b.label} ${n(b.unitFileHus)}/${n(b.listUnits)} (${pct(b.completeness)})`).join(" | ")}`);
  console.log(`  HU's per principal: ${JSON.stringify(rv.perPrincipal)}  zonder rit: ${rv.husWithoutRide}`);
}

const set = computeReportSet(enriched.units, period, comparisons, {}, rides);
const subjects: VolumeSlideSubject[] = ["WIAG", "AWKG", "Liqui Moly", "Total"];
console.log("");
for (const s of subjects) {
  const m = volumeSlide(set, s);
  console.log(`${s.padEnd(11)} in ${n(m.inbound.totalHus)} HU / ${m.inbound.totalRides} ritten   uit ${n(m.outbound.totalHus)} HU / ${m.outbound.totalRides} ritten   [${m.outbound.hus.join(", ")}]`);
  for (const t of m.insights) console.log(`            ▸ ${t}`);
}
if (args.out) {
  mkdirSync(args.out, { recursive: true });
  const file = join(args.out, `volume-${period.key}.html`);
  writeFileSync(file, volumeDocument(subjects.map((s, i) => renderVolumeSlide(volumeSlide(set, s), `${i + 4} / 21`)), `Volume ${period.label}`));
  console.log(`\n${file}`);
}
