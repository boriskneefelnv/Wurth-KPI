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
  availablePeriods,
  customPeriod,
  makePeriod,
  REPORT_KINDS,
  type ComparisonKind,
  type ReportKind,
} from "../src/core/period";
import ExcelJS from "exceljs";
import { comparisonOptionsWithQuality, periodQuality, rideIssues, type RideIssueKind } from "../src/core/report/quality";
import { reconcileRideLists, reconcileVolume } from "../src/core/report/reconcile";
import { computeReportSet } from "../src/core/report/report";
import { volumeSlide, type VolumeSlideSubject } from "../src/core/slides/volume";
import { mergeWmsExports, parseWmsSheets, WMS_EXPORT_ROW_LIMIT } from "../src/core/wms/excel";
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
    issues: { type: "string" },
  },
});
if (!args.units || !args.laden || !args.lossen) throw new Error("--units, --laden en --lossen zijn verplicht");

const read = async (f: string) => readXlsx(new Uint8Array(readFileSync(f)));
const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);
const n = (x: number) => x.toLocaleString("nl-NL");

const unitParts = [];
for (const f of args.units.split(",")) {
  const p = parseWmsSheets(await read(f));
  if (p.rows.length >= WMS_EXPORT_ROW_LIMIT) console.log(`LET OP: ${f} heeft ${n(p.rows.length)} rijen, waarschijnlijk afgekapt door de WMS-exportlimiet`);
  unitParts.push(p);
}
const merged = mergeWmsExports(unitParts);
if (unitParts.length > 1) console.log("SAMENGEVOEGD", merged.sources.map((s) => `${n(s.rows)} rijen, ${n(s.added)} nieuw`).join(" + "), "=", n(merged.rows.length));
const enriched = enrichWms(merged);
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

const [kind, key] = args.period.split(":") as [ReportKind | "custom", string];
const period = kind === "custom" ? customPeriod(...(key.split("..") as [string, string])) : makePeriod(kind, key);
const requested = (args.compare ? args.compare.split(",") : []) as ComparisonKind[];
const quality = (p: typeof period) => periodQuality(enriched.units, planned, rides, p);
const options = comparisonOptionsWithQuality(period, coverage, quality);
const comparisons = requested.filter((c) => options.find((o) => o.kind === c)?.usable);
const q = quality(period);
console.log(`\nRAPPORT ${period.label}  aansluiting unitoverzicht/rittenlijst: in ${pct(q.inbound)}, uit ${pct(q.outbound)} ${q.ok ? "OK" : "WAARSCHUWING"}`);
for (const o of options) console.log(`  vergelijking ${o.kind} (${o.period.label}): ${o.usable ? "bruikbaar" : o.reason}`);
console.log(`  gebruikt: ${comparisons.join(", ") || "geen"}`);

const recList = reconcileRideLists(enriched.units, planned, rides, period);
const recVol = reconcileVolume(enriched.units, v.rejected, rides, period);
for (const dir of ["inbound", "outbound"] as const) {
  const r = recList[dir];
  const rv = recVol[dir];
  console.log(`\n== ${dir.toUpperCase()}`);
  console.log(`  rittenlijst: ${n(r.listRides)} ritten, ${n(r.listUnits)} units  (genegeerd: test ${r.ignored.test.rides}/${r.ignored.test.units}u, cancel ${r.ignored.cancelled.rides}, leeg ${r.ignored.empty}; nog open zonder scans ${r.notHandled.rides} ritten/${r.notHandled.units}u; meegeteld ondanks open status ${r.countedWithOpenStatus.rides} ritten ${JSON.stringify(r.countedWithOpenStatus.statuses)})`);
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
  console.log(`            ${m.headline}`);
  if (m.subline) console.log(`            ${m.subline}`);
}
if (args.out) {
  mkdirSync(args.out, { recursive: true });
  const file = join(args.out, `volume-${period.key}.html`);
  writeFileSync(file, volumeDocument(subjects.map((s, i) => renderVolumeSlide(volumeSlide(set, s), `${i + 4} / 21`)), `Volume ${period.label}`));
  console.log(`\n${file}`);
}

if (args.issues) {
  const LABEL: Record<RideIssueKind, string> = {
    "missing-in-unit-file": "Telt niet mee: afgerond op lijst, geen gescande pallets",
    "not-on-ride-list": "Telt niet mee: pallets gescand, rit niet op lijst",
    "unit-count-differs": "Telt mee: aantal gescande pallets wijkt af van lijst",
    "counted-open-status": "Telt mee: pallets gescand, status lijst nog open of cancel",
    "not-handled": "Telt niet mee: status open, niets gescand",
    "ignored-test": "Telt niet mee: testrit",
  };
  const issues = rideIssues(enriched.units, planned, rides, period);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ritten om te controleren");
  ws.columns = [
    { header: "Richting", key: "dir", width: 10 },
    { header: "Ritnummer", key: "rit", width: 15 },
    { header: "Bevinding", key: "kind", width: 40 },
    { header: "Verwachte datum", key: "planned", width: 15 },
    { header: "Scandatum (5%)", key: "scan", width: 15 },
    { header: "Status rittenlijst", key: "status", width: 22 },
    { header: "Referentie", key: "ref", width: 22 },
    { header: "Units rittenlijst", key: "list", width: 15 },
    { header: "Gescande pallets", key: "hus", width: 17 },
    { header: "Verschil", key: "diff", width: 10 },
    { header: "Opdrachtgever", key: "opdr", width: 28 },
    { header: "Dossiers (max 10)", key: "dos", width: 40 },
  ];
  for (const i of issues) {
    ws.addRow({
      dir: i.direction === "inbound" ? "Inkomend" : "Uitgaand",
      rit: i.ritNummer,
      kind: LABEL[i.kind],
      planned: i.plannedDate ?? "",
      scan: i.scanDate ?? "",
      status: i.status ?? "",
      ref: i.referentie ?? "",
      list: i.listUnits ?? "",
      hus: i.unitFileHus,
      diff: i.listUnits === null ? "" : i.unitFileHus - i.listUnits,
      opdr: i.opdrachtgevers.join(", "),
      dos: i.dossiers.join(", "),
    });
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "L1" };
  await wb.xlsx.writeFile(args.issues);
  const count: Record<string, number> = {};
  for (const i of issues) count[LABEL[i.kind]] = (count[LABEL[i.kind]] ?? 0) + 1;
  console.log(`\n${args.issues}`, count);
}
