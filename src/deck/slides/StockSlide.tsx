import { useState } from "react";
import type { StockKey } from "../../core/report/stock";
import { fmtDay, fmtDec, fmtInt } from "../../core/slides/format";
import type { StockSlideModel, StockView } from "../../core/slides/stock";
import type { MainPrincipal } from "../../core/types";
import { ANIM, entry, useAnimate, useTweenNumber } from "../anim";
import { PrincipalToggle } from "../PrincipalToggle";
import { SlideShell } from "../SlideShell";
import { FONT, T } from "../tokens";

const PRINCIPAL_BLUE: Record<MainPrincipal, string> = { WIAG: "#1E5478", AWKG: "#2A7AB0", "Liqui Moly": "#4FA0D4" };
const glide = `height ${ANIM.switch}ms ease-out, bottom ${ANIM.switch}ms ease-out`;

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
  const target = Math.max(4, raw) * 1.15;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  const norm = target / mag;
  const step = (norm <= 1 ? 0.25 : norm <= 2 ? 0.5 : norm <= 5 ? 1 : 2) * mag;
  const max = Math.ceil(target / step) * step;
  return { max, ticks: [0, max / 4, max / 2, (max * 3) / 4, max] };
}

function Chart({ model, view }: { model: StockSlideModel; view: StockView }) {
  const animate = useAnimate();
  const [hover, setHover] = useState<number | null>(null);
  const n = view.buckets.length;
  const { max, ticks } = niceMax(Math.max(...view.buckets.map((b) => Math.max(b.avg, b.ghost ?? 0))));
  const PLOT_H = 300;
  const Y_W = 52;
  const barW = n <= 4 ? 64 : n <= 7 ? 56 : n <= 10 ? 44 : 28;
  const showValues = n <= 13;
  const h = (v: number) => (v > 0 ? Math.max(1, (v / max) * PLOT_H) : 0);
  const stacked = view.buckets.some((b) => b.parts);
  const showGhost = view.buckets.some((b) => b.ghost !== null);

  return (
    <div style={{ flex: 1, minHeight: 0, background: T.card, borderRadius: 6, boxShadow: T.cardShadow, padding: "14px 22px 10px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.textSecondary }}>{model.per} · average HUs in stock</div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, fontWeight: 500, color: T.heroText }}>
          {stacked ? (
            (Object.keys(PRINCIPAL_BLUE) as MainPrincipal[]).map((p) => <Legend key={p} el={<span style={{ width: 11, height: 11, borderRadius: 2, background: PRINCIPAL_BLUE[p] }} />} label={p} />)
          ) : (
            <Legend el={<span style={{ width: 11, height: 11, borderRadius: 2, background: T.bluePrimary }} />} label="Average stock" />
          )}
          {showGhost && model.ghostLabel && <Legend el={<span style={{ width: 14, height: 2, background: T.heroText }} />} label={model.ghostLabel} />}
        </div>
      </div>
      <div style={{ display: "flex" }}>
        <div style={{ width: Y_W, position: "relative", height: PLOT_H }}>
          {ticks.map((t) => (
            <div key={t} style={{ position: "absolute", right: 10, top: PLOT_H - (t / max) * PLOT_H - 6, fontSize: 10, color: T.axis, fontVariantNumeric: "tabular-nums" }}>
              {fmtInt(t)}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: PLOT_H }}>
            {ticks.map((t) => (
              <div key={t} style={{ position: "absolute", left: 0, right: 0, top: PLOT_H - (t / max) * PLOT_H, borderTop: `1px dashed ${T.gridline}`, opacity: t === 0 ? 1 : 0.55 }} />
            ))}
          </div>
          <div style={{ position: "relative", height: PLOT_H, display: "flex", justifyContent: "space-around", alignItems: "flex-end", padding: "0 8px" }}>
            {view.buckets.map((b, i) => {
              const delay = i * ANIM.barStagger;
              const parts = b.parts ?? [{ principal: null, avg: b.avg }];
              let base = 0;
              return (
                <div key={b.key} style={{ position: "relative", width: barW, height: PLOT_H }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <div style={{ position: "absolute", left: 0, bottom: 0, width: barW, height: PLOT_H, transformOrigin: "bottom", ...(animate ? { transform: "scaleY(0)", animation: `deckBarGrow ${ANIM.barGrow}ms ${delay}ms ease-out forwards` } : {}) }}>
                    {parts.map((p, k) => {
                      const bottom = h(base);
                      base += p.avg;
                      return (
                        <div
                          key={p.principal ?? k}
                          style={{
                            position: "absolute",
                            left: 0,
                            width: barW,
                            bottom,
                            height: h(base) - bottom,
                            background: p.principal ? PRINCIPAL_BLUE[p.principal] : T.bluePrimary,
                            borderTopLeftRadius: k === parts.length - 1 ? 2 : 0,
                            borderTopRightRadius: k === parts.length - 1 ? 2 : 0,
                            transition: glide,
                          }}
                        />
                      );
                    })}
                  </div>
                  {b.ghost !== null && (
                    <div style={{ position: "absolute", left: -4, width: barW + 8, bottom: h(b.ghost) - 1, height: 2, background: T.heroText, opacity: 0.75, transition: glide, ...entry(animate, "deckFadeIn", 250, delay + ANIM.markerDelay) }} />
                  )}
                  {showValues && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: Math.max(h(b.avg), b.ghost !== null ? h(b.ghost) : 0) + 5,
                        left: barW / 2 - 30,
                        width: 60,
                        textAlign: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        color: T.heroText,
                        fontVariantNumeric: "tabular-nums",
                        transition: glide,
                        ...entry(animate, "deckFadeIn", ANIM.labelIn, delay + ANIM.barGrow),
                      }}
                    >
                      {fmtInt(b.avg)}
                    </div>
                  )}
                  {hover === i && <Tip model={model} b={b} barW={barW} bottom={Math.min(PLOT_H - 90, h(b.avg) + 26)} />}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", padding: "0 8px", marginTop: 8 }}>
            {view.buckets.map((b) => (
              <div key={b.key} style={{ width: barW, textAlign: "center", fontSize: 12, fontWeight: 500, color: T.heroText, whiteSpace: "nowrap" }}>
                {b.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Tip({ model, b, barW, bottom }: { model: StockSlideModel; b: StockView["buckets"][number]; barW: number; bottom: number }) {
  const rows: [string, number][] = [["Average stock", b.avg], ...(b.parts ?? []).map((p) => [p.principal, p.avg] as [string, number])];
  if (b.ghost !== null && model.ghostLabel) rows.push([model.ghostLabel, b.ghost]);
  return (
    <div
      style={{
        position: "absolute",
        left: barW / 2 - 100,
        bottom,
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
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{b.label}</div>
      {rows.map(([name, v], i) => (
        <div key={name} style={{ display: "flex", justifyContent: "space-between", color: i === 0 ? T.heroText : T.textSecondary }}>
          <span>{name}</span>
          <strong style={{ fontVariantNumeric: "tabular-nums", fontWeight: i === 0 ? 700 : 500 }}>{fmtInt(v)} HUs</strong>
        </div>
      ))}
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
