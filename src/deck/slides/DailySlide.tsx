import { useState } from "react";
import type { DailyKey } from "../../core/report/daily";
import { fmtDec, fmtInt, plural } from "../../core/slides/format";
import type { DailySlideModel, DailyView } from "../../core/slides/daily";
import { ANIM, entry, useAnimate, useTweenNumber } from "../anim";
import { PrincipalToggle } from "../PrincipalToggle";
import { SlideShell } from "../SlideShell";
import { FONT, T } from "../tokens";

const AVG = "#7DB73E";

/**
 * Daily workload: HUs in and out per day as stacked bars, with the average
 * workday as a line. Buttons on the slide switch between all principals and
 * each principal; figures, bars and texts follow the choice.
 */
export function DailySlide({ model, page, total }: { model: DailySlideModel; page: number; total: number }) {
  const [key, setKey] = useState<DailyKey>("Total");
  const view = model.views[key];
  return (
    <SlideShell title={model.title} topBar={<PrincipalToggle options={model.order.map((k) => ({ key: k, label: model.views[k].label }))} selected={key} onSelect={setKey} />} page={page} total={total}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
        <Card index={0} label="HUs per workday" value={view.avgPerWorkday?.total ?? null} sub={`${fmtInt(view.inbound.reduce((a, b) => a + b, 0) + view.outbound.reduce((a, b) => a + b, 0))} HUs in total`} delta={view.avgDeltaPct} deltaLabel={model.comparisonLabel} />
        <Card index={1} label="Inbound per workday" value={view.avgPerWorkday?.inbound ?? null} sub={perRide(view.inbound, view.inboundRides)} swatch={T.inbound} />
        <Card index={2} label="Outbound per workday" value={view.avgPerWorkday?.outbound ?? null} sub={perRide(view.outbound, view.outboundRides)} swatch={T.outbound} />
        <Card
          index={3}
          label="Busiest day"
          value={view.peak?.total ?? null}
          sub={view.peak ? view.peak.label : ""}
          note={view.peakRatio !== null ? `${fmtDec(view.peakRatio)}× an average workday` : null}
        />
      </div>
      <Chart model={model} view={view} />
    </SlideShell>
  );
}

function perRide(hus: number[], rides: number[]): string {
  const h = hus.reduce((a, b) => a + b, 0);
  const r = rides.reduce((a, b) => a + b, 0);
  return r > 0 ? `${fmtInt(r)} rides · ${fmtDec(h / r)} HUs per ride` : `${fmtInt(h)} HUs`;
}

function Card({
  index,
  label,
  value,
  sub,
  delta,
  deltaLabel,
  note,
  swatch,
}: {
  index: number;
  label: string;
  value: number | null;
  sub: string;
  delta?: number | null;
  deltaLabel?: string | null;
  note?: string | null;
  swatch?: string;
}) {
  const animate = useAnimate();
  const delay = index * ANIM.cardStagger;
  const n = useTweenNumber(value ?? 0, ANIM.count, delay);
  return (
    <div
      style={{
        background: T.card,
        borderRadius: 6,
        boxShadow: T.cardShadow,
        borderTop: `3px solid ${swatch ?? T.heroText}`,
        padding: "12px 16px",
        ...entry(animate, "deckRiseIn", ANIM.cardIn, delay),
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: T.inbound, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: T.heroText, lineHeight: 1.05, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{value === null ? "n/a" : fmtInt(n)}</div>
      <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
      <div style={{ marginTop: 7, minHeight: 19, ...entry(animate, "deckFadeIn", ANIM.badgeIn, ANIM.badgeDelay + delay) }}>
        {delta != null && deltaLabel ? <Delta pct={delta} label={deltaLabel} /> : note ? <span style={{ fontSize: 11, color: T.textSecondary }}>{note}</span> : null}
      </div>
    </div>
  );
}

function Delta({ pct, label }: { pct: number; label: string }) {
  const up = pct >= 2;
  const style = up ? { background: "#E8F4E1", color: "#3D7F1F" } : { background: "#E9EFF5", color: "#475569" };
  return (
    <span style={{ display: "inline-flex", gap: 5, padding: "2px 8px", borderRadius: 10, fontSize: 10.5, whiteSpace: "nowrap", ...style }}>
      <strong>
        {pct >= 0 ? "+" : "-"}
        {Math.abs(Math.round(pct))}%
      </strong>
      <span style={{ opacity: 0.85 }}>{label}</span>
    </span>
  );
}

/** Calm axis maximum with four steps. */
function niceMax(raw: number): { max: number; ticks: number[] } {
  const target = Math.max(4, raw) * 1.12;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  const norm = target / mag;
  const step = (norm <= 1 ? 0.25 : norm <= 2 ? 0.5 : norm <= 5 ? 1 : 2) * mag;
  const max = Math.ceil(target / step) * step;
  return { max, ticks: [0, max / 4, max / 2, (max * 3) / 4, max] };
}

function Chart({ model, view }: { model: DailySlideModel; view: DailyView }) {
  const animate = useAnimate();
  const [hover, setHover] = useState<number | null>(null);
  const n = model.days.length;
  const totals = view.inbound.map((v, i) => v + view.outbound[i]!);
  const { max, ticks } = niceMax(Math.max(0, ...totals));
  const PLOT_H = 262;
  const Y_W = 48;
  const PLOT_W = 1184 - 40 - Y_W; // card width minus padding and axis
  const slot = PLOT_W / Math.max(1, n);
  const barW = Math.max(2, Math.min(56, slot * (n > 40 ? 0.72 : 0.6)));
  const h = (v: number) => (v > 0 ? Math.max(1, (v / max) * PLOT_H) : 0);
  const stagger = Math.min(ANIM.barStagger, 700 / Math.max(1, n));
  const avg = view.avgPerWorkday?.total ?? 0;
  const perDayLabels = n <= 31;
  const glide = `height ${ANIM.switch}ms ease-out, bottom ${ANIM.switch}ms ease-out`;

  return (
    <div style={{ flex: 1, minHeight: 0, background: T.card, borderRadius: 6, boxShadow: T.cardShadow, padding: "12px 20px 10px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.textSecondary }}>{n <= 7 ? "Per day" : "Per workday"} · HUs inbound and outbound</div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, fontWeight: 500, color: T.heroText }}>
          <Legend swatch={<span style={{ width: 11, height: 11, borderRadius: 2, background: T.inbound }} />} label="Inbound" />
          <Legend swatch={<span style={{ width: 11, height: 11, borderRadius: 2, background: T.outbound }} />} label="Outbound" />
          <Legend swatch={<span style={{ width: 16, borderTop: `2px dashed ${AVG}` }} />} label="Average workday" />
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
              <div key={t} style={{ position: "absolute", left: 0, right: 0, top: PLOT_H - (t / max) * PLOT_H, borderTop: `1px dashed ${T.gridline}`, opacity: t === 0 ? 1 : 0.5 }} />
            ))}
            {!perDayLabels &&
              model.days.map((d, i) =>
                d.monthStart && i > 0 ? <div key={d.day} style={{ position: "absolute", top: 0, height: PLOT_H, left: i * slot, borderLeft: `1px solid ${T.borderSubtle}` }} /> : null,
              )}
          </div>

          <div style={{ position: "relative", height: PLOT_H }}>
            {model.days.map((d, i) => {
              const hi = h(view.inbound[i]!);
              const ho = h(view.outbound[i]!);
              const delay = i * stagger;
              const isPeak = view.peak?.day === d.day;
              return (
                <div
                  key={d.day}
                  style={{ position: "absolute", left: i * slot, width: slot, top: 0, height: PLOT_H }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: (slot - barW) / 2,
                      bottom: 0,
                      width: barW,
                      height: hi + ho,
                      transformOrigin: "bottom",
                      transition: glide,
                      opacity: hover === null || hover === i ? 1 : 0.55,
                      ...(animate ? { transform: "scaleY(0)", animation: `deckBarGrow ${ANIM.barGrow}ms ${delay}ms ease-out forwards` } : {}),
                    }}
                  >
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: hi, background: T.inbound, transition: glide }} />
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: hi, height: ho, background: T.outbound, borderTopLeftRadius: 1.5, borderTopRightRadius: 1.5, transition: glide }} />
                  </div>
                  {isPeak && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: hi + ho + 4,
                        left: "50%",
                        transform: "translateX(-50%)",
                        fontSize: 10,
                        fontWeight: 700,
                        color: T.heroText,
                        whiteSpace: "nowrap",
                        transition: glide,
                        ...entry(animate, "deckFadeIn", ANIM.labelIn, ANIM.barGrow + delay),
                      }}
                    >
                      {fmtInt(hi + ho > 0 ? view.peak!.total : 0)}
                    </div>
                  )}
                </div>
              );
            })}
            {avg > 0 && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: (avg / max) * PLOT_H,
                  borderTop: `2px dashed ${AVG}`,
                  pointerEvents: "none",
                  transition: `bottom ${ANIM.switch}ms ease-out`,
                  ...entry(animate, "deckFadeIn", 300, ANIM.barGrow + 300),
                }}
              >
                <span style={{ position: "absolute", right: 0, bottom: 3, fontSize: 10, fontWeight: 700, color: "#4E8A22", background: "rgba(255,255,255,0.9)", padding: "0 3px" }}>
                  Avg {fmtInt(avg)}
                </span>
              </div>
            )}
            {hover !== null && <DayTooltip model={model} view={view} i={hover} slot={slot} plotH={PLOT_H} top={PLOT_H - h(totals[hover]!)} />}
          </div>

          <div style={{ position: "relative", height: 20, marginTop: 6 }}>
            {perDayLabels
              ? model.days.map((d, i) => (
                  <div key={d.day} style={{ position: "absolute", left: i * slot, width: slot, textAlign: "center", fontSize: n <= 7 ? 12 : 10, fontWeight: 500, color: d.workday ? T.heroText : T.textSecondary, whiteSpace: "nowrap" }}>
                    {n <= 7 ? d.short : Number(d.day.slice(8, 10))}
                  </div>
                ))
              : model.days.map((d, i) =>
                  d.monthStart ? (
                    <div key={d.day} style={{ position: "absolute", left: i * slot + 6, fontSize: 12, fontWeight: 500, color: T.heroText, whiteSpace: "nowrap" }}>
                      {d.month}
                    </div>
                  ) : null,
                )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayTooltip({ model, view, i, slot, plotH, top }: { model: DailySlideModel; view: DailyView; i: number; slot: number; plotH: number; top: number }) {
  const W = 200;
  const center = i * slot + slot / 2;
  const left = Math.max(0, Math.min(center - W / 2, slot * model.days.length - W));
  const rows: [string, number, number][] = [
    ["Inbound", view.inbound[i]!, view.inboundRides[i]!],
    ["Outbound", view.outbound[i]!, view.outboundRides[i]!],
  ];
  return (
    <div
      style={{
        position: "absolute",
        left,
        bottom: Math.min(plotH - 70, plotH - top + 10),
        width: W,
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
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{model.days[i]!.label}</div>
      {rows.map(([name, hus, rides]) => (
        <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span>{name}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            <strong>{fmtInt(hus)}</strong> HUs <span style={{ color: T.textSecondary }}>· {plural(rides, "ride", "rides")}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ display: "inline-flex", alignItems: "center" }}>{swatch}</span>
      {label}
    </span>
  );
}
