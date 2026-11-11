import { useEffect, useMemo, useRef, useState } from "react";
import {
  availablePeriods,
  comparisonPeriod,
  customPeriod,
  makePeriod,
  type ComparisonKind,
  type ReportKind,
} from "../core/period";
import { comparisonOptionsWithQuality, LAADDATUM_LEAD_MONTHS, periodQuality, rideIssues, unitExportAdvice } from "../core/report/quality";
import { reconcileRideLists } from "../core/report/reconcile";
import { computeReportSet } from "../core/report/report";
import { checkUnitExport, LEAD_MONTHS, lastScanDay, TRAIL_MONTHS, unitExportRange } from "../core/wms/exportRange";
import { coverageFromRideLists, indexPlannedRides } from "../core/wms/rideLists";
import { materializeRides } from "../core/wms/rides";
import { StaticRenderContext } from "../deck/anim";
import { assetUrls } from "../deck/assets";
import { buildDeck, longDate, type SlideDef } from "../deck/deck";
import { inlineAssets, interactiveDeckDocument, renderSlidesStatic } from "../deck/exportHtml";
import { Presentation } from "../deck/Presentation";
import { SLIDE_H, SLIDE_W } from "../deck/tokens";
import { buildControlListXlsx } from "./controlList";
import type { Dataset, FileInfo } from "./load";

const KIND_LABEL: Record<ReportKind, string> = { week: "Week", month: "Maand", quarter: "Kwartaal", half: "Half jaar", year: "Jaar" };
const COMPARISON_LABEL: Record<ComparisonKind, string> = { previous: "Vorige periode", lastYear: "Zelfde periode vorig jaar" };
const FILE_KIND_LABEL = { units: "Unitoverzicht", "ride-list-outbound": "Te laden ritten", "ride-list-inbound": "Te lossen ritten" } as const;

const nl = (x: number) => x.toLocaleString("nl-NL");
/** 2025-09-01 → 01-09-2025 (as typed in the WMS). */
const nlDate = (k: string) => `${k.slice(8, 10)}-${k.slice(5, 7)}-${k.slice(0, 4)}`;
const today = () => new Date().toISOString().slice(0, 10);
const pct = (x: number | null) => (x === null ? "" : `${(x * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`);

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ReportKind>("quarter");
  const [periodKey, setPeriodKey] = useState<string>("");
  const [chosen, setChosen] = useState<ComparisonKind[]>(["previous", "lastYear"]);
  const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [presenting, setPresenting] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  // One worker for the session: it keeps the files read so far.
  useEffect(() => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (e) => {
      const m = e.data as { type: string; msg?: string; dataset?: Dataset };
      if (m.type === "progress") setBusy(m.msg ?? null);
      if (m.type === "done") {
        setDataset(m.dataset!);
        setBusy(null);
      }
      if (m.type === "error") {
        setError(m.msg ?? "Onbekende fout");
        setBusy(null);
      }
    };
    return () => worker.terminate();
  }, []);

  async function load(fileList: FileList | File[]) {
    const files = await Promise.all([...fileList].map(async (f) => ({ name: f.name, data: await f.arrayBuffer() })));
    if (!files.length || !workerRef.current) return;
    setError(null);
    setBusy("Bestanden lezen…");
    workerRef.current.postMessage({ type: "add", files }, files.map((f) => f.data));
  }

  function removeFile(name: string) {
    setBusy("Bijwerken…");
    workerRef.current?.postMessage({ type: "remove", name });
  }

  function clearFiles() {
    workerRef.current?.postMessage({ type: "clear" });
  }

  // Derived data
  const base = useMemo(() => {
    if (!dataset || dataset.units.length === 0 || dataset.lists.length === 0) return null;
    const planned = indexPlannedRides(dataset.lists);
    const { rides } = materializeRides(dataset.units, { planned });
    // Ride lists may contain planned rides: stop at the last day pallets were actually scanned.
    const listCoverage = coverageFromRideLists(dataset.lists);
    const lastScan = lastScanDay(dataset.units);
    const coverage = listCoverage && lastScan && lastScan < listCoverage.to ? { ...listCoverage, to: lastScan } : listCoverage;
    return { planned, rides, coverage };
  }, [dataset]);

  const quality = useMemo(() => {
    if (!base || !dataset) return null;
    return (p: ReturnType<typeof makePeriod>) => periodQuality(dataset.units, base.planned, base.rides, p);
  }, [base, dataset]);

  // Only periods where the unit file matches the ride lists can be reported.
  const { periods, unavailable } = useMemo(() => {
    if (!base || !quality) return { periods: [], unavailable: [] };
    const all = availablePeriods(kind, base.coverage);
    const ok = all.filter((p) => quality(p).ok);
    return { periods: ok, unavailable: all.filter((p) => !ok.includes(p)) };
  }, [base, quality, kind]);
  useEffect(() => {
    if (periods.length && !periods.some((p) => p.key === periodKey)) setPeriodKey(periods[0]!.key);
  }, [periods, periodKey]);
  const period = periods.find((p) => p.key === periodKey) ?? null;

  const options = useMemo(
    () => (period && base && quality ? comparisonOptionsWithQuality(period, base.coverage, quality) : []),
    [period, base, quality],
  );
  const usable = options.filter((o) => o.usable && chosen.includes(o.kind)).map((o) => o.kind);
  const periodOk = period && quality ? quality(period) : null;

  const reportSet = useMemo(() => {
    if (!period || !dataset || !base) return null;
    return computeReportSet(dataset.units, period, usable, {}, base.rides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, dataset, base, usable.join(",")]);
  const slides: SlideDef[] = useMemo(
    () => (reportSet ? buildDeck(reportSet, new Date(`${meetingDate}T12:00:00`)) : []),
    [reportSet, meetingDate],
  );

  const monthly = useMemo(() => {
    if (!base?.coverage || !dataset) return null;
    const full = customPeriod(base.coverage.from, base.coverage.to);
    const r = reconcileRideLists(dataset.units, base.planned, base.rides, full);
    return r.inbound.perBucket.map((b, i) => ({ key: b.key, from: b.from, to: b.to, inbound: b, outbound: r.outbound.perBucket[i]! }));
  }, [base, dataset]);

  // Which Laaddatum range the unit overview must cover, given the ride lists.
  const exportAdvice = useMemo(() => (dataset?.lists.length ? unitExportRange(dataset.lists, today()) : null), [dataset]);
  const exportCheck = useMemo(
    () => (exportAdvice && dataset?.units.length ? checkUnitExport(dataset.units, exportAdvice) : null),
    [exportAdvice, dataset],
  );

  // Months that do not match, and whether the unit export simply starts too late for them.
  const advice = useMemo(() => {
    if (!monthly || !dataset) return null;
    const failing = monthly
      .filter((m) => m.inbound.unitFileHus + m.outbound.unitFileHus > 0)
      .filter((m) => [m.inbound.completeness, m.outbound.completeness].some((c) => c !== null && Math.abs(1 - c) > 0.02))
      .map((m) => m.key);
    return unitExportAdvice(dataset.units, failing);
  }, [monthly, dataset]);

  // Months for which the unit file holds data (at least half of the expected pallets in both directions).
  const dataRange = useMemo(() => {
    const months = (monthly ?? []).filter((m) => (m.inbound.completeness ?? 0) >= 0.5 && (m.outbound.completeness ?? 0) >= 0.5);
    return months.length ? { from: months[0]!.from, to: months[months.length - 1]!.to } : null;
  }, [monthly]);

  async function downloadControlList() {
    if (!dataset || !base || !dataRange) return;
    const issues = rideIssues(dataset.units, base.planned, base.rides, customPeriod(dataRange.from, dataRange.to));
    download(`Controlelijst ritten ${dataRange.from} tm ${dataRange.to}.xlsx`, await buildControlListXlsx(issues), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  /** One HTML file with the same presentation as in the app (runtime, data and images inside). */
  async function standaloneDeck(): Promise<string> {
    if (!reportSet) throw new Error("Geen rapport");
    const assets = await inlineAssets(assetUrls(import.meta.env.BASE_URL));
    const runtime = await (await fetch(`${import.meta.env.BASE_URL}runtime/present.js`)).text();
    return interactiveDeckDocument({
      runtime,
      data: { set: reportSet, meetingDate, assets },
      printSlides: renderSlidesStatic(slides, assets),
      title: `QBR Würth ${reportSet.current.period.label}`,
    });
  }

  async function exportHtml() {
    if (!period) return;
    setExporting(true);
    try {
      download(`QBR Wurth ${period.label}.html`, await standaloneDeck(), "text/html");
    } finally {
      setExporting(false);
    }
  }

  async function printSlides() {
    if (!period) return;
    const w = window.open("", "_blank");
    if (!w) return;
    setExporting(true);
    try {
      w.document.write(await standaloneDeck());
      w.document.close();
      setTimeout(() => w.print(), 1200);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">Würth KPI-tool</div>
        <div className="by">Neele-Vat Maasvlakte</div>
      </header>

      <section className="panel">
        <div className="eyebrow">Stap 1</div>
        <h2>Bestanden</h2>
        <ol className="steps">
          <li>
            Draai <strong>Te laden ritten</strong> en <strong>Te lossen ritten</strong> voor de periode die je wilt laten zien (bijvoorbeeld
            01-01-2026 t/m 30-06-2026) en sleep ze hieronder in.
          </li>
          <li>De tool zegt dan voor welke laaddatums je het <strong>unitoverzicht</strong> moet draaien. Sleep dat er daarna bij.</li>
        </ol>
        <p className="muted">Bestanden worden bij elkaar opgeteld; de tool herkent zelf wat wat is. Alles blijft op deze computer.</p>
        <label
          className="drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void load(e.dataTransfer.files);
          }}
        >
          <input type="file" accept=".xlsx" multiple onChange={(e) => e.target.files && void load(e.target.files)} />
          <span>Bestanden kiezen of hierheen slepen</span>
        </label>
        {busy && <p className="busy">{busy}</p>}
        {error && <p className="error">{error}</p>}
        {exportAdvice && (
          <div className={`advice ${exportCheck?.ok ? "ok" : ""}`}>
            <div className="eyebrow">Unitoverzicht draaien</div>
            <p className="big">
              Laaddatum van <strong>{nlDate(exportAdvice.from)}</strong> t/m <strong>{nlDate(exportAdvice.to)}</strong>
            </p>
            <p className="muted">
              De ritten lopen van {nlDate(exportAdvice.rides.from)} t/m {nlDate(exportAdvice.rides.to)}. De laaddatum is de ophaaldatum bij de
              leverancier en ligt meestal weken vóór de rit door het magazijn, soms ook kort erna. Daarom {LEAD_MONTHS} maanden ervoor en{" "}
              {TRAIL_MONTHS} maand erna (zo valt 99,97% van de pallets erin, gemeten over 2025 en 2026). Geeft de WMS precies 50.000 rijen,
              draai de periode dan in twee of meer delen en sleep ze allemaal in.
            </p>
            {exportCheck &&
              (exportCheck.ok ? (
                <p className="ok">
                  De ingeladen unitoverzichten dekken dit (laaddatum {nlDate(exportCheck.loaded!.from)} t/m {nlDate(exportCheck.loaded!.to)}).
                </p>
              ) : (
                <p className="warn">
                  Nog niet gedekt:
                  {exportCheck.missingStart && ` laaddatum ${nlDate(exportCheck.missingStart.from)} t/m ${nlDate(exportCheck.missingStart.to)}`}
                  {exportCheck.missingStart && exportCheck.missingEnd && " en"}
                  {exportCheck.missingEnd && ` laaddatum ${nlDate(exportCheck.missingEnd.from)} t/m ${nlDate(exportCheck.missingEnd.to)}`}. Draai dat
                  deel erbij en sleep het in.
                </p>
              ))}
          </div>
        )}
        {dataset && dataset.files.length > 0 && <FileTable files={dataset.files} onRemove={removeFile} onClear={clearFiles} />}
        {dataset && dataset.lists.length > 0 && dataset.units.length === 0 && (
          <p className="muted">Sleep nu het unitoverzicht erbij.</p>
        )}
      </section>

      {base && dataset && monthly && (
        <section className="panel">
          <div className="eyebrow">Stap 2</div>
          <h2>Aansluiting</h2>
          <p className="muted">
            Ritdata van {base.coverage?.from} t/m {base.coverage?.to}. Per maand: units op de rittenlijsten tegenover gescande pallets in het
            unitoverzicht. Wijkt een maand meer dan 2% af, dan is die periode niet bruikbaar als vergelijking.
          </p>
          {advice && (
            <div className="callout">
              <strong>
                {advice.month} sluit niet aan omdat het unitoverzicht te laat begint (laaddatum vanaf {advice.firstLaaddatum}).
              </strong>{" "}
              De laaddatum is de ophaaldatum bij de leverancier en ligt weken voor de rit door het magazijn (tot ongeveer{" "}
              {LAADDATUM_LEAD_MONTHS} maanden). Pallets die eerder zijn opgehaald staan daardoor niet in het bestand. Exporteer het
              unitoverzicht vanaf laaddatum <strong>{advice.exportFrom}</strong>; bij meer dan 50.000 rijen in twee delen, de tool voegt
              ze samen.
            </div>
          )}
          <table className="grid">
            <thead>
              <tr>
                <th>Maand</th>
                <th className="num">In: lijst</th>
                <th className="num">In: gescand</th>
                <th className="num">Aansluiting</th>
                <th className="num">Uit: lijst</th>
                <th className="num">Uit: gescand</th>
                <th className="num">Aansluiting</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.key}>
                  <td>{m.key}</td>
                  <td className="num">{nl(m.inbound.listUnits)}</td>
                  <td className="num">{nl(m.inbound.unitFileHus)}</td>
                  <td className={`num ${flag(m.inbound.completeness)}`}>{pct(m.inbound.completeness)}</td>
                  <td className="num">{nl(m.outbound.listUnits)}</td>
                  <td className="num">{nl(m.outbound.unitFileHus)}</td>
                  <td className={`num ${flag(m.outbound.completeness)}`}>{pct(m.outbound.completeness)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {dataRange && (
            <button className="secondary" onClick={() => void downloadControlList()}>
              Controlelijst ritten downloaden (.xlsx)
            </button>
          )}
          {dataRange && <span className="muted note">Ritten van {dataRange.from} t/m {dataRange.to}, de maanden waarvoor unitdata is.</span>}
        </section>
      )}

      {base && (
        <section className="panel">
          <div className="eyebrow">Stap 3</div>
          <h2>Rapport</h2>
          <div className="controls">
            <label>
              Soort
              <select value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
                {(Object.keys(KIND_LABEL) as ReportKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Periode
              <select value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} disabled={!periods.length}>
                {periods.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Vergelijken met</legend>
              {options.map((o) => (
                <label key={o.kind} className={o.usable ? "" : "disabled"} title={o.reason ?? ""}>
                  <input
                    type="checkbox"
                    disabled={!o.usable}
                    checked={o.usable && chosen.includes(o.kind)}
                    onChange={(e) => setChosen((c) => (e.target.checked ? [...c, o.kind] : c.filter((x) => x !== o.kind)))}
                  />
                  {COMPARISON_LABEL[o.kind]} ({comparisonPeriod(period!, o.kind).label})
                  {!o.usable && <span className="reason">{o.reason}</span>}
                </label>
              ))}
            </fieldset>
          </div>
          {!periods.length && <p className="error">Geen {KIND_LABEL[kind].toLowerCase()} waarvoor de bestanden volledig aansluiten.</p>}
          {unavailable.length > 0 && (
            <p className="muted note">
              Niet beschikbaar omdat het unitoverzicht niet aansluit op de rittenlijsten: {unavailable.map((p) => p.label).join(", ")}.
            </p>
          )}
          {periodOk && !periodOk.ok && (
            <p className="error">
              Let op: voor {period?.label} sluit het unitoverzicht niet aan op de rittenlijsten (in {pct(periodOk.inbound)}, uit{" "}
              {pct(periodOk.outbound)}). Controleer of het unitoverzicht deze periode volledig bevat.
            </p>
          )}
        </section>
      )}

      {slides.length > 0 && period && (
        <section className="panel">
          <div className="eyebrow">Stap 4</div>
          <h2>Presentatie {period.label}</h2>
          <div className="actions">
            <button onClick={() => setPresenting(0)}>Presenteren</button>
            <button className="secondary" onClick={() => void exportHtml()} disabled={exporting}>
              HTML downloaden
            </button>
            <button className="secondary" onClick={() => void printSlides()} disabled={exporting}>
              Afdrukken of PDF
            </button>
            <label className="inline">
              Datum presentatie
              <input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
            </label>
          </div>
          <p className="muted note">
            Presenteren: pijltjes of spatie om te bladeren, F volledig scherm, G overzicht, Esc sluiten. Klik op een slide om vanaf die slide te
            presenteren. Cover: {longDate(new Date(`${meetingDate}T12:00:00`))}.
          </p>
          <div className="slides">
            {slides.map((s, i) => (
              <button key={s.id} className="slide-card" onClick={() => setPresenting(i)} title={`Presenteren vanaf ${s.title}`}>
                <ScaledSlide>{s.render(i + 1, slides.length)}</ScaledSlide>
                <span>
                  {i + 1}. {s.title}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {presenting !== null && slides.length > 0 && <Presentation slides={slides} start={presenting} onClose={() => setPresenting(null)} />}
    </div>
  );
}

function flag(x: number | null) {
  if (x === null) return "";
  return Math.abs(1 - x) <= 0.02 ? "ok" : "warn";
}

function FileTable({ files, onRemove, onClear }: { files: FileInfo[]; onRemove: (name: string) => void; onClear: () => void }) {
  const note = (f: FileInfo) => {
    if (f.error) return f.error;
    if (f.warning) return f.warning;
    const range = f.dateRange ? `${f.kind === "units" ? "Laaddatum" : "Ritten"} ${nlDate(f.dateRange.from)} t/m ${nlDate(f.dateRange.to)}` : "";
    const overlap = f.added !== undefined && f.added < f.rows ? `; ${nl(f.rows - f.added)} rijen overlappen met een ander unitoverzicht` : "";
    return range + overlap;
  };
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Bestand</th>
          <th>Soort</th>
          <th className="num">Rijen</th>
          <th>Opmerking</th>
          <th className="num">
            <button className="link" onClick={onClear}>
              Alles wissen
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {files.map((f) => (
          <tr key={f.name}>
            <td>{f.name}</td>
            <td>{f.kind ? FILE_KIND_LABEL[f.kind] : ""}</td>
            <td className="num">{nl(f.rows)}</td>
            <td className={f.error || f.warning ? "warn" : "muted"}>{note(f)}</td>
            <td className="num">
              <button className="link" onClick={() => onRemove(f.name)}>
                Verwijderen
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A 1280×720 slide in its final state, scaled to the available width. */
function ScaledSlide({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / SLIDE_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="slide-frame" style={{ height: SLIDE_H * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: SLIDE_W, height: SLIDE_H }}>
        <StaticRenderContext.Provider value={true}>{children}</StaticRenderContext.Provider>
      </div>
    </div>
  );
}
