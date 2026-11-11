import { useEffect, useMemo, useRef, useState } from "react";
import {
  availablePeriods,
  comparisonPeriod,
  customPeriod,
  makePeriod,
  type ComparisonKind,
  type ReportKind,
} from "../core/period";
import { comparisonOptionsWithQuality, periodQuality, rideIssues } from "../core/report/quality";
import { reconcileRideLists } from "../core/report/reconcile";
import { computeReportSet } from "../core/report/report";
import { coverageFromRideLists, indexPlannedRides } from "../core/wms/rideLists";
import { materializeRides } from "../core/wms/rides";
import { StaticRenderContext } from "../deck/anim";
import { assetUrls } from "../deck/assets";
import { buildDeck, longDate, type SlideDef } from "../deck/deck";
import { deckDocument, inlineAssets, renderSlidesStatic } from "../deck/exportHtml";
import { Presentation } from "../deck/Presentation";
import { SLIDE_H, SLIDE_W } from "../deck/tokens";
import { buildControlListXlsx } from "./controlList";
import type { Dataset, FileInfo } from "./load";

const KIND_LABEL: Record<ReportKind, string> = { week: "Week", month: "Maand", quarter: "Kwartaal", half: "Half jaar", year: "Jaar" };
const COMPARISON_LABEL: Record<ComparisonKind, string> = { previous: "Vorige periode", lastYear: "Zelfde periode vorig jaar" };
const FILE_KIND_LABEL = { units: "Unitoverzicht", "ride-list-outbound": "Te laden ritten", "ride-list-inbound": "Te lossen ritten" } as const;

const nl = (x: number) => x.toLocaleString("nl-NL");
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

  async function load(fileList: FileList | File[]) {
    const files = await Promise.all([...fileList].map(async (f) => ({ name: f.name, data: await f.arrayBuffer() })));
    if (!files.length) return;
    setError(null);
    setBusy("Bestanden lezen…");
    workerRef.current?.terminate();
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (e) => {
      const m = e.data as { type: string; msg?: string; dataset?: Dataset };
      if (m.type === "progress") setBusy(m.msg ?? null);
      if (m.type === "done") {
        setDataset(m.dataset!);
        setBusy(null);
        worker.terminate();
      }
      if (m.type === "error") {
        setError(m.msg ?? "Onbekende fout");
        setBusy(null);
        worker.terminate();
      }
    };
    worker.postMessage({ files }, files.map((f) => f.data));
  }

  // Derived data
  const base = useMemo(() => {
    if (!dataset || dataset.units.length === 0 || dataset.lists.length === 0) return null;
    const planned = indexPlannedRides(dataset.lists);
    const { rides } = materializeRides(dataset.units, { planned });
    const coverage = coverageFromRideLists(dataset.lists);
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

  const slides: SlideDef[] = useMemo(() => {
    if (!period || !dataset || !base) return [];
    const set = computeReportSet(dataset.units, period, usable, {}, base.rides);
    return buildDeck(set, new Date(`${meetingDate}T12:00:00`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, dataset, base, usable.join(","), meetingDate]);

  const monthly = useMemo(() => {
    if (!base?.coverage || !dataset) return null;
    const full = customPeriod(base.coverage.from, base.coverage.to);
    const r = reconcileRideLists(dataset.units, base.planned, base.rides, full);
    return r.inbound.perBucket.map((b, i) => ({ key: b.key, from: b.from, to: b.to, inbound: b, outbound: r.outbound.perBucket[i]! }));
  }, [base, dataset]);

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

  async function standaloneDeck(): Promise<string> {
    const assets = await inlineAssets(assetUrls(import.meta.env.BASE_URL));
    return deckDocument(renderSlidesStatic(slides, assets), `QBR Würth ${period?.label ?? ""}`);
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
      setTimeout(() => w.print(), 800);
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
        <p className="muted">
          Sleep hier het unitoverzicht (een of meer bestanden), Te laden ritten en Te lossen ritten in. De tool herkent zelf welk bestand wat is.
          Alles blijft op deze computer.
        </p>
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
        {dataset && <FileTable files={dataset.files} />}
        {dataset && !base && (
          <p className="error">Voor het rapport zijn minstens een unitoverzicht en de rittenlijsten nodig.</p>
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

function FileTable({ files }: { files: FileInfo[] }) {
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Bestand</th>
          <th>Soort</th>
          <th className="num">Rijen</th>
          <th>Opmerking</th>
        </tr>
      </thead>
      <tbody>
        {files.map((f) => (
          <tr key={f.name}>
            <td>{f.name}</td>
            <td>{f.kind ? FILE_KIND_LABEL[f.kind] : ""}</td>
            <td className="num">{nl(f.rows)}</td>
            <td className={f.error || f.warning ? "warn" : "muted"}>
              {f.error ??
                f.warning ??
                (f.dateRange
                  ? `Ritten ${f.dateRange.from} t/m ${f.dateRange.to}`
                  : f.added !== undefined && f.added < f.rows
                    ? `${nl(f.rows - f.added)} rijen overlappen met een ander unitoverzicht`
                    : "")}
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
