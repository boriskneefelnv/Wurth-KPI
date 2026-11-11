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
import { lastScanDay } from "../core/wms/exportRange";
import { exportRequirements, missingSpans, type DateSpan, type DisplayRange } from "../core/wms/requirements";
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

/** Default: the last complete quarter, compared with the quarter before and the same quarter last year. */
function defaultRange(): DisplayRange {
  const d = new Date();
  const q = Math.floor(d.getUTCMonth() / 3); // current quarter index
  const start = new Date(Date.UTC(d.getUTCFullYear(), (q - 1) * 3, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), q * 3 - 1, 1));
  const ym = (x: Date) => x.toISOString().slice(0, 7);
  return { from: ym(start), to: ym(end), previous: true, lastYear: true };
}
const RANGE_KEY = "wurth-kpi-range";
function loadRange(): DisplayRange {
  try {
    const r = JSON.parse(localStorage.getItem(RANGE_KEY) ?? "null") as DisplayRange | null;
    if (r && /^\d{4}-\d{2}$/.test(r.from) && /^\d{4}-\d{2}$/.test(r.to)) return r;
  } catch {
    /* no storage */
  }
  return defaultRange();
}
function saveRange(r: DisplayRange) {
  try {
    localStorage.setItem(RANGE_KEY, JSON.stringify(r));
  } catch {
    /* no storage */
  }
}
/** Report kind that matches the length of the shown range. */
function kindFor(r: DisplayRange): ReportKind {
  const [y1, m1] = r.from.split("-").map(Number) as [number, number];
  const [y2, m2] = r.to.split("-").map(Number) as [number, number];
  const n = (y2 - y1) * 12 + (m2 - m1) + 1;
  return n <= 1 ? "month" : n <= 3 ? "quarter" : n <= 6 ? "half" : "year";
}
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
  const [range, setRange] = useState<DisplayRange>(loadRange);
  useEffect(() => saveRange(range), [range]);
  const updateRange = (patch: Partial<DisplayRange>) =>
    setRange((r) => {
      const next = { ...r, ...patch };
      setKind(kindFor(next));
      setChosen([...(next.previous ? (["previous"] as const) : []), ...(next.lastYear ? (["lastYear"] as const) : [])]);
      return next;
    });
  const [kind, setKind] = useState<ReportKind>(() => kindFor(loadRange()));
  const [periodKey, setPeriodKey] = useState<string>("");
  const [chosen, setChosen] = useState<ComparisonKind[]>(() => {
    const r = loadRange();
    return [...(r.previous ? (["previous"] as const) : []), ...(r.lastYear ? (["lastYear"] as const) : [])];
  });
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
  const req = useMemo(() => exportRequirements(range, today()), [range]);

  const { periods, unavailable } = useMemo(() => {
    if (!base || !quality) return { periods: [], unavailable: [] };
    const all = availablePeriods(kind, base.coverage).filter((p) => p.from >= req.display.from && p.to <= req.display.to);
    const ok = all.filter((p) => quality(p).ok);
    return { periods: ok, unavailable: all.filter((p) => !ok.includes(p)) };
  }, [base, quality, kind, req]);
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
    return r.inbound.perBucket
      .map((b, i) => ({ key: b.key, from: b.from, to: b.to, inbound: b, outbound: r.outbound.perBucket[i]! }))
      .filter((m) => m.to >= req.rides.from && m.from <= req.rides.to);
  }, [base, dataset, req]);

  // Per source: what has to be exported, and what is still missing.
  const sources = useMemo(() => {
    const files = dataset?.files ?? [];
    const status = (kind: FileInfo["kind"], required: DateSpan) => {
      const own = files.filter((f) => f.kind === kind);
      const spans = own.flatMap((f) => (f.span ? [f.span] : []));
      if (!own.length) return { loaded: false, missing: [] as DateSpan[], cutAt: [] as string[] };
      // Days where a capped export stopped: a missing part starting there is caused by the 50.000-row limit.
      const cutAt = spans.filter((sp) => sp.capped).map((sp) => sp.to);
      return { loaded: true, missing: missingSpans(required, spans), cutAt };
    };
    return [
      { kind: "ride-list-outbound" as const, label: "Te laden ritten", field: "Verwachte datum", required: req.rides, ...status("ride-list-outbound", req.rides) },
      { kind: "ride-list-inbound" as const, label: "Te lossen ritten", field: "Verwachte datum", required: req.rides, ...status("ride-list-inbound", req.rides) },
      { kind: "units" as const, label: "Unitoverzicht", field: "Laaddatum", required: req.units, ...status("units", req.units) },
    ];
  }, [dataset, req]);

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
        <img className="by" src={`${import.meta.env.BASE_URL}brand/neelevat-maasvlakte-blue.png`} alt="Neele-Vat Maasvlakte" />
      </header>

      <section className="panel">
        <div className="eyebrow">Stap 1</div>
        <h2>Periode en bestanden</h2>
        <div className="controls">
          <label>
            Laten zien van
            <input type="month" value={range.from} max={range.to} onChange={(e) => e.target.value && updateRange({ from: e.target.value })} />
          </label>
          <label>
            t/m
            <input type="month" value={range.to} min={range.from} onChange={(e) => e.target.value && updateRange({ to: e.target.value })} />
          </label>
          <fieldset>
            <legend>Vergelijken met</legend>
            <label>
              <input type="checkbox" checked={range.previous} onChange={(e) => updateRange({ previous: e.target.checked })} />
              De periode ervoor
            </label>
            <label>
              <input type="checkbox" checked={range.lastYear} onChange={(e) => updateRange({ lastYear: e.target.checked })} />
              Dezelfde periode vorig jaar
            </label>
          </fieldset>
        </div>

        <div className="exports">
          <div className="eyebrow">Draai deze exports uit de WMS</div>
          <table className="grid sources">
            <thead>
              <tr>
                <th>Export</th>
                <th>Filter op</th>
                <th>Van</th>
                <th>T/m</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((src) => (
                <tr key={src.kind}>
                  <td>
                    <strong>{src.label}</strong>
                  </td>
                  <td>{src.field}</td>
                  <td className="date">{nlDate(src.required.from)}</td>
                  <td className="date">{nlDate(src.required.to)}</td>
                  <td>
                    {!src.loaded ? (
                      <span className="muted">Nog niet ingeladen</span>
                    ) : src.missing.length === 0 ? (
                      <span className="ok">Compleet</span>
                    ) : (
                      <span className="warn">
                        Nog draaien:{" "}
                        {src.missing
                          .map((m) => `${nlDate(m.from)} t/m ${nlDate(m.to)}${src.cutAt.includes(m.from) ? " (export afgekapt op 50.000 rijen)" : ""}`)
                          .join(" en ")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

        </div>

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
        {dataset && dataset.files.length > 0 && <FileTable files={dataset.files} onRemove={removeFile} onClear={clearFiles} />}
      </section>

      {base && dataset && monthly && (
        <section className="panel">
          <div className="eyebrow">Stap 2</div>
          <h2>Aansluiting</h2>
          <p className="muted">
            Per maand: units op de rittenlijsten tegenover gescande pallets in het
            unitoverzicht. Wijkt een maand meer dan 2% af, dan is die periode niet bruikbaar als vergelijking.
          </p>
          {advice && (
            <div className="callout">
              <strong>
                {advice.month} sluit niet aan omdat het unitoverzicht te laat begint (laaddatum vanaf {nlDate(advice.firstLaaddatum)}).
              </strong>{" "}
              De laaddatum is de ophaaldatum bij de leverancier en ligt weken voor de rit door het magazijn (tot ongeveer{" "}
              {LAADDATUM_LEAD_MONTHS} maanden). Pallets die eerder zijn opgehaald staan daardoor niet in het bestand. Exporteer het
              unitoverzicht vanaf laaddatum <strong>{nlDate(advice.exportFrom)}</strong>; bij meer dan 50.000 rijen in twee delen, de tool voegt
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
          {dataRange && (
            <span className="muted note">
              Ritten van {nlDate(dataRange.from)} t/m {nlDate(dataRange.to)}, de maanden waarvoor unitdata is.
            </span>
          )}
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
    if (f.capped && f.span) return `Afgekapt op 50.000 rijen: bevat laaddatum ${nlDate(f.span.from)} t/m ${nlDate(f.span.to)} (laatste dag onvolledig)`;
    const range = f.span ? `${f.kind === "units" ? "Laaddatum" : "Ritten"} ${nlDate(f.span.from)} t/m ${nlDate(f.span.to)}` : "";
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
            <td className={f.error || f.capped ? "warn" : "muted"}>{note(f)}</td>
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
