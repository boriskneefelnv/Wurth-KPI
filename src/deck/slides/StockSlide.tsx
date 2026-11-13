import { useState } from "react";
import type { StockKey } from "../../core/report/stock";
import { fmtDay, fmtDec, fmtInt } from "../../core/slides/format";
import type { StockSlideModel, StockView } from "../../core/slides/stock";
import type { MainPrincipal } from "../../core/types";
import { ANIM, entry, useAnimate, useTweenNumber } from "../anim";
import { PrincipalToggle } from "../PrincipalToggle";
import { SlideShell } from "../SlideShell";
import { FONT, T } from "../tokens";

/** Stacked areas need clearly different colours (as in the original Würth module): Liqui Moly in green. */
const PRINCIPAL_BLUE: Record<MainPrincipal, string> = { WIAG: "#1E5478", AWKG: "#4FA0D4", "Liqui Moly": "#7DB73E" };

/**
 * Stock: average HUs in stock per month (end of each day, averaged), stacked
 * per principal in the all principals view, with last year as a marker.
 */
export function StockSlide({ model, page, total }: { model: StockSlideModel; page: number; total: number }) {
  const [key, setKey] = useState<StockKey>("Total");
  const view = model.views[key];
  const end = model.period.to;
  return (
    <SlideShell
      title={model.title}
      topBar={<PrincipalToggle options={model.order.map((k) => ({ key: k, label: model.views[k].label }))} selected={key} onSelect={setKey} />}
      page={page}
      total={total}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
        <Card index={0} label="Average stock" value={view.avg} unit="HUs" delta={view.avgDeltaPct} deltaLabel={model.comparisonLabel} sub="End of day, averaged" />
        <Card index={1} label="Stock at period end" value={view.end} unit="HUs" sub={fmtDay(end)} />
        <Card index={2} label="Highest stock" value={view.peak?.hus ?? null} unit="HUs" sub={view.peak ? fmtDay(view.peak.day) : ""} />
        <Card index={3} label="Stock in workdays" value={view.workdaysOfStock} decimals unit="days" sub="Of outbound at the average pace" />
      </div>
      <Chart model={model} view={view} />
    </SlideShell>
  );
}

function Card({
  index,
  label,
  value,
  unit,
  decimals,
  sub,
  delta,
  deltaLabel,
}: {
  index: number;
  label: string;
  value: number | null;
  unit: string;
  decimals?: boolean;
  sub: string;
  delta?: number | null;
  deltaLabel?: string | null;
}) {
  const animate = useAnimate();
  const delay = index * ANIM.cardStagger;
  const n = useTweenNumber(value ?? 0, ANIM.count, delay);
  return (
    <div style={{ background: T.card, borderRadius: 6, boxShadow: T.cardShadow, borderTop: `3px solid ${T.heroText}`, padding: "11px 16px", ...entry(animate, "deckRiseIn", ANIM.cardIn, delay) }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: T.inbound, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 5 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: T.heroText, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{value === null ? "n/a" : decimals ? fmtDec(n) : fmtInt(n)}</span>
        {value !== null && <span style={{ fontSize: 13, color: T.textSecondary }}>{unit}</span>}
      </div>
      <div style={{ marginTop: 6, minHeight: 19, ...entry(animate, "deckFadeIn", ANIM.badgeIn, ANIM.badgeDelay + delay) }}>
        {delta != null && deltaLabel ? <Delta pct={delta} label={deltaLabel} /> : <span style={{ fontSize: 11, color: T.textSecondary, whiteSpace: "nowrap" }}>{sub}</span>}
      </div>
    </div>
  );
}

/** Stock up or down is neither good nor bad: a neutral pill. */
function Delta({ pct, label }: { pct: number; label: string }) {
  return (
    <span style={{ display: "inline-flex", gap: 5, padding: "2px 8px", borderRadius: 10, fontSize: 10.5, whiteSpace: "nowrap", background: "#E9EFF5", color: "#475569" }}>
      <strong>
        {pct >= 0 ? "+" : "-"}
        {Math.abs(Math.round(pct))}%
      </strong>
      <span style={{ opacity: 0.85 }}>{label}</span>
    </span>
  );
}

function niceMax(raw: number): { max: number; ticks: number[] } {
  const target = Math.max(4, raw) * 1.12;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  const norm = target / mag;
  const step = (norm <= 1 ? 0.25 : norm <= 2 ? 0.5 : norm <= 5 ? 1 : 2) * mag;
  const max = Math.ceil(target / step) * step;
  return { max, ticks: [0, max / 4, max / 2, (max * 3) / 4, max] };
}

/** Smooth line through the points without overshoot (monotone cubic). */
function smooth(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0]![0]},${pts[0]![1]}`;
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i]![0]);
  const sl = pts.slice(1).map((p, i) => (p[1] - pts[i]![1]) / dx[i]!);
  const m = pts.map((_, i) => (i === 0 ? sl[0]! : i === n - 1 ? sl[n - 2]! : sl[i - 1]! * sl[i]! <= 0 ? 0 : (sl[i - 1]! + sl[i]!) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / sl[i]!;
    const b = m[i + 1]! / sl[i]!;
    const t = a * a + b * b;
    if (t > 9) {
      const k = 3 / Math.sqrt(t);
      m[i] = k * a * sl[i]!;
      m[i + 1] = k * b * sl[i]!;
    }
  }
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const h = dx[i]! / 3;
    d += `C${(x0 + h).toFixed(1)},${(y0 + m[i]! * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - m[i + 1]! * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

const LAYERS: MainPrincipal[] = ["WIAG", "AWKG", "Liqui Moly"];

function Chart({ model, view }: { model: StockSlideModel; view: StockView }) {
  const animate = useAnimate();
  const [hover, setHover] = useState<number | null>(null);
  const pts = model.points;
  const n = pts.length;
  const layers = view.key === "Total" ? LAYERS : [view.key as MainPrincipal];
  const totals = pts.map((p) => layers.reduce((a, l) => a + p.parts[l], 0));
  const ghosts = pts.map((p) => p.ghost[view.key]);
  const { max, ticks } = niceMax(Math.max(...totals, ...ghosts.map((g) => g ?? 0)));
  const W = 1076;
  const H = 300;
  const PAD = n > 1 ? 34 : W / 2;
  const x = (i: number) => (n > 1 ? PAD + (i * (W - 2 * PAD)) / (n - 1) : W / 2);
  const y = (v: number) => H - (v / max) * H;
  const showValues = n <= 13;
  const step = n > 1 ? (W - 2 * PAD) / (n - 1) : W;
  const everyLabel = Math.max(1, Math.ceil(n / 14));

  // Stacked areas, bottom layer first.
  const cum: number[][] = [];
  layers.forEach((l, k) => cum.push(pts.map((p, i) => (k ? cum[k - 1]![i]! : 0) + p.parts[l])));
  const areas = layers.map((l, k) => {
    const top = smooth(cum[k]!.map((v, i) => [x(i), y(v)]));
    const bottomPts = (k ? cum[k - 1]! : pts.map(() => 0)).map((v, i) => [x(i), y(v)] as [number, number]).reverse();
    const bottom = smooth(bottomPts).replace(/^M/, "L");
    return { l, area: `${top}${bottom}Z`, line: top };
  });
  const ghostPts = ghosts.map((g, i) => (g === null ? null : ([x(i), y(g)] as [number, number])));
  const ghostLine = ghostPts.every((p) => p !== null) && n > 1 ? smooth(ghostPts as [number, number][]) : null;
  const morph = `d ${ANIM.switch}ms ease-out`;

  return (
    <div style={{ flex: 1, minHeight: 0, background: T.card, borderRadius: 6, boxShadow: T.cardShadow, padding: "14px 22px 10px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: T.textSecondary }}>Average HUs in stock {model.pointUnit}</div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, fontWeight: 500, color: T.heroText }}>
          {layers.map((p) => (
            <Legend key={p} el={<span style={{ width: 11, height: 11, borderRadius: 2, background: PRINCIPAL_BLUE[p] }} />} label={p} />
          ))}
          {ghostLine && model.ghostLabel && <Legend el={<span style={{ width: 16, borderTop: `2px dashed ${T.heroText}` }} />} label={model.ghostLabel} />}
        </div>
      </div>
      <div style={{ display: "flex" }}>
        <div style={{ width: 52, position: "relative", height: H }}>
          {ticks.map((t) => (
            <div key={t} style={{ position: "absolute", right: 10, top: y(t) - 6, fontSize: 10, color: T.axis, fontVariantNumeric: "tabular-nums" }}>
              {fmtInt(t)}
            </div>
          ))}
        </div>
        <div style={{ position: "relative", width: W }} onMouseLeave={() => setHover(null)}>
          <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
            {ticks.map((t) => (
              <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} stroke={T.gridline} strokeDasharray="3 4" opacity={t === 0 ? 1 : 0.55} />
            ))}
            <g style={animate ? { clipPath: "inset(0 100% 0 0)", animation: `deckReveal 900ms 150ms ease-out forwards` } : undefined}>
              {areas.map((a) => (
                <g key={a.l}>
                  <path d={a.area} fill={PRINCIPAL_BLUE[a.l]} fillOpacity={0.78} style={{ transition: morph }} />
                  <path d={a.line} fill="none" stroke={PRINCIPAL_BLUE[a.l]} strokeWidth={1.6} style={{ transition: morph }} />
                </g>
              ))}
              {ghostLine && <path d={ghostLine} fill="none" stroke={T.heroText} strokeWidth={1.6} strokeDasharray="5 4" opacity={0.8} style={{ transition: morph }} />}
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke={T.heroText} strokeOpacity={0.35} />}
              {hover !== null &&
                cum.map((c, k) => <circle key={k} cx={x(hover)} cy={y(c[hover]!)} r={3.5} fill="#fff" stroke={PRINCIPAL_BLUE[layers[k]!]} strokeWidth={2} />)}
            </g>
          </svg>
          {showValues &&
            totals.map((t, i) => (
              <div
                key={pts[i]!.key}
                style={{
                  position: "absolute",
                  left: x(i) - 30,
                  width: 60,
                  top: Math.min(y(t), ghosts[i] !== null ? y(ghosts[i]!) : H) - 20,
                  textAlign: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.heroText,
                  fontVariantNumeric: "tabular-nums",
                  transition: `top ${ANIM.switch}ms ease-out`,
                  ...entry(animate, "deckFadeIn", ANIM.labelIn, 900),
                }}
              >
                {fmtInt(t)}
              </div>
            ))}
          {pts.map((p, i) => (
            <div key={p.key} style={{ position: "absolute", top: 0, height: H, left: x(i) - step / 2, width: step }} onMouseEnter={() => setHover(i)} />
          ))}
          {hover !== null && <Tip model={model} view={view} i={hover} left={x(hover)} layers={layers} />}
          <div style={{ position: "relative", height: 18, marginTop: 8 }}>
            {pts.map((p, i) =>
              i % everyLabel === 0 ? (
                <div key={p.key} style={{ position: "absolute", left: x(i) - 40, width: 80, textAlign: "center", fontSize: 12, fontWeight: 500, color: T.heroText, whiteSpace: "nowrap" }}>
                  {p.label}
                </div>
              ) : null,
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Tip({ model, view, i, left, layers }: { model: StockSlideModel; view: StockView; i: number; left: number; layers: MainPrincipal[] }) {
  const p = model.points[i]!;
  const total = layers.reduce((a, l) => a + p.parts[l], 0);
  const rows: [string, number][] = layers.length > 1 ? [...layers].reverse().map((l) => [l, p.parts[l]] as [string, number]) : [];
  const ghost = p.ghost[view.key];
  return (
    <div
      style={{
        position: "absolute",
        left: Math.min(Math.max(0, left + 14), 1076 - 210),
        top: 10,
        width: 200,
        zIndex: 20,
        background: "#fff",
        border: `1px solid ${T.inbound}`,
        boxShadow: "0 4px 12px rgba(12,58,92,0.15)",
        padding: "8px 10px",
        fontSize: 11,
        color: T.heroText,
        fontFamily: FONT,
        pointerEvents: "none",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.label}</div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Average stock</span>
        <strong style={{ fontVariantNumeric: "tabular-nums" }}>{fmtInt(total)} HUs</strong>
      </div>
      {rows.map(([name, v]) => (
        <div key={name} style={{ display: "flex", justifyContent: "space-between", color: T.textSecondary }}>
          <span>{name}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtInt(v)}</span>
        </div>
      ))}
      {ghost !== null && model.ghostLabel && (
        <div style={{ display: "flex", justifyContent: "space-between", color: T.textSecondary, borderTop: `1px solid ${T.borderSubtle}`, marginTop: 4, paddingTop: 3 }}>
          <span>{p.label} last year</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtInt(ghost)}</span>
        </div>
      )}
    </div>
  );
}

function Legend({ el, label }: { el: React.ReactNode; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {el}
      {label}
    </span>
  );
}
