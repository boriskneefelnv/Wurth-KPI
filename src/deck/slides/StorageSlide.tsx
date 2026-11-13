import { useState } from "react";
import { fmtDec, fmtInt } from "../../core/slides/format";
import { fmtDays, type StorageKey, type StorageSlideModel, type StorageView } from "../../core/slides/storage";
import { ANIM, entry, useAnimate, useTweenNumber } from "../anim";
import { PrincipalToggle } from "../PrincipalToggle";
import { SlideShell } from "../SlideShell";
import { T } from "../tokens";

const PLOT_H = 236;
const glide = `height ${ANIM.switch}ms ease-out, bottom ${ANIM.switch}ms ease-out`;

/**
 * Storage duration: average and median days in the warehouse, the spread over
 * duration groups and the average per month. Buttons switch between all
 * principals and each principal.
 */
export function StorageSlide({ model, page, total }: { model: StorageSlideModel; page: number; total: number }) {
  const [key, setKey] = useState<StorageKey>("Total");
  const view = model.views[key];
  const over = view.groups[view.groups.length - 1]!;
  return (
    <SlideShell title={model.title} subtitle={view.headline} page={page} total={total}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <PrincipalToggle options={model.order.map((k) => ({ key: k, label: model.views[k].label }))} selected={key} onSelect={setKey} />
        <span style={{ fontSize: 11, color: T.textSecondary }}>HUs that left the warehouse in {model.period.label}, by days in storage</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
        <Card index={0} label="Average storage" value={view.avgDays} decimals unit="days" delta={view.avgDelta} deltaLabel={model.comparisonLabel} />
        <Card index={1} label="Median storage" value={view.medianDays} decimals whole unit="days" delta={view.medianDelta} deltaLabel={model.comparisonLabel} />
        <Card index={2} label="HUs measured" value={view.count} sub="Shipped with a storage duration" />
        <Card index={3} label="Over 60 days" value={over.share} decimals unit="%" sub={`${fmtInt(over.count)} HUs`} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 14 }}>
        <Spread view={view} ghostLabel={model.ghostLabel} />
        <PerPeriod view={view} per={model.per} />
      </div>
    </SlideShell>
  );
}

function Card({
  index,
  label,
  value,
  decimals,
  whole,
  unit,
  sub,
  delta,
  deltaLabel,
}: {
  index: number;
  label: string;
  value: number | null;
  decimals?: boolean;
  /** Show whole numbers without a decimal (medians). */
  whole?: boolean;
  unit?: string;
  sub?: string;
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
        <span style={{ fontSize: 30, fontWeight: 700, color: T.heroText, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>
          {value === null ? "n/a" : whole && n === value ? fmtDays(n) : decimals ? fmtDec(n) : fmtInt(n)}
          {value !== null && unit === "%" ? "%" : ""}
        </span>
        {value !== null && unit && unit !== "%" && <span style={{ fontSize: 13, color: T.textSecondary }}>{unit}</span>}
      </div>
      <div style={{ marginTop: 6, minHeight: 19, ...entry(animate, "deckFadeIn", ANIM.badgeIn, ANIM.badgeDelay + delay) }}>
        {delta != null && deltaLabel ? <DaysDelta days={delta} label={deltaLabel} /> : sub ? <span style={{ fontSize: 11, color: T.textSecondary }}>{sub}</span> : null}
      </div>
    </div>
  );
}

/** Change in days: shorter storage is shown neutral blue, longer as plain grey. */
function DaysDelta({ days, label }: { days: number; label: string }) {
  const same = Math.abs(days) < 0.5;
  const style = same ? { background: "#E9EFF5", color: "#475569" } : days < 0 ? { background: "#E3EEF7", color: T.inbound } : { background: "#F1F0EC", color: "#5F5A4E" };
  return (
    <span style={{ display: "inline-flex", gap: 5, padding: "2px 8px", borderRadius: 10, fontSize: 10.5, whiteSpace: "nowrap", ...style }}>
      <strong>{same ? "same" : `${days > 0 ? "+" : "-"}${fmtDec(Math.abs(days))} days`}</strong>
      <span style={{ opacity: 0.85 }}>{label}</span>
    </span>
  );
}

function Panel({ title, legend, children }: { title: string; legend?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: T.card, borderRadius: 6, boxShadow: T.cardShadow, padding: "12px 20px 10px", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: T.textSecondary }}>{title}</div>
        <div style={{ display: "flex", gap: 14, fontSize: 11, fontWeight: 500, color: T.heroText }}>{legend}</div>
      </div>
      {children}
    </div>
  );
}

function Swatch({ el, label }: { el: React.ReactNode; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {el}
      {label}
    </span>
  );
}

function Spread({ view, ghostLabel }: { view: StorageView; ghostLabel: string | null }) {
  const animate = useAnimate();
  const max = Math.max(10, ...view.groups.map((g) => Math.max(g.share ?? 0, g.ghostShare ?? 0))) * 1.12;
  const h = (v: number) => (v / max) * PLOT_H;
  const showGhost = view.groups.some((g) => g.ghostShare !== null);
  return (
    <Panel
      title="Spread over storage duration"
      legend={
        <>
          <Swatch el={<span style={{ width: 11, height: 11, borderRadius: 2, background: T.bluePrimary }} />} label="Share of HUs" />
          {showGhost && ghostLabel && <Swatch el={<span style={{ width: 14, height: 2, background: T.heroText }} />} label={ghostLabel} />}
        </>
      }
    >
      <div style={{ position: "relative", height: PLOT_H, marginTop: 18, display: "flex", justifyContent: "space-around", alignItems: "flex-end", borderBottom: `1px solid ${T.gridline}` }}>
        {view.groups.map((g, i) => {
          const bh = g.share === null ? 0 : Math.max(g.share > 0 ? 2 : 0, h(g.share));
          const delay = i * ANIM.barStagger;
          return (
            <div key={g.bucket} style={{ position: "relative", width: 58, height: PLOT_H }}>
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: 58,
                  height: bh,
                  background: T.bluePrimary,
                  borderTopLeftRadius: 2,
                  borderTopRightRadius: 2,
                  transformOrigin: "bottom",
                  transition: glide,
                  ...(animate ? { transform: "scaleY(0)", animation: `deckBarGrow ${ANIM.barGrow}ms ${delay}ms ease-out forwards` } : {}),
                }}
              />
              {g.ghostShare !== null && (
                <div
                  title={`${fmtDec(g.ghostShare)}% in ${ghostLabel ?? ""}`}
                  style={{ position: "absolute", left: -4, width: 66, bottom: h(g.ghostShare) - 1, height: 2, background: T.heroText, opacity: 0.75, transition: glide, ...entry(animate, "deckFadeIn", 250, delay + ANIM.markerDelay) }}
                />
              )}
              {g.share !== null && (
                <div
                  style={{
                    position: "absolute",
                    bottom: Math.max(bh, g.ghostShare !== null ? h(g.ghostShare) : 0) + 5,
                    left: 0,
                    width: 58,
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    color: T.heroText,
                    transition: glide,
                    fontVariantNumeric: "tabular-nums",
                    ...entry(animate, "deckFadeIn", ANIM.labelIn, delay + ANIM.barGrow),
                  }}
                >
                  {fmtInt(g.share)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 7 }}>
        {view.groups.map((g) => (
          <div key={g.bucket} style={{ width: 90, textAlign: "center" }}>
            <div style={{ fontSize: 11.5, fontWeight: 500, color: T.heroText, whiteSpace: "nowrap" }}>{g.label}</div>
            <div style={{ fontSize: 10.5, color: T.textSecondary, marginTop: 1 }}>{fmtInt(g.count)} HUs</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function PerPeriod({ view, per }: { view: StorageView; per: string }) {
  const animate = useAnimate();
  const rows = view.perPeriod;
  const max = Math.max(5, ...rows.map((r) => Math.max(r.avgDays ?? 0, r.medianDays ?? 0))) * 1.15;
  const h = (v: number) => (v / max) * PLOT_H;
  const n = rows.length;
  const barW = n <= 3 ? 56 : n <= 6 ? 40 : n <= 9 ? 26 : 16;
  return (
    <Panel
      title={`${per} · average days`}
      legend={
        <>
          <Swatch el={<span style={{ width: 11, height: 11, borderRadius: 2, background: T.outbound }} />} label="Average" />
          <Swatch el={<span style={{ width: 14, height: 3, background: T.heroText }} />} label="Median" />
        </>
      }
    >
      <div style={{ position: "relative", height: PLOT_H, marginTop: 18, display: "flex", justifyContent: "space-around", alignItems: "flex-end", borderBottom: `1px solid ${T.gridline}` }}>
        {rows.map((r, i) => {
          const bh = r.avgDays === null ? 0 : h(r.avgDays);
          const delay = i * ANIM.barStagger;
          return (
            <div key={r.key} title={r.avgDays === null ? `${r.label}: no HUs` : `${r.label}: average ${fmtDec(r.avgDays)}, median ${fmtDays(r.medianDays!)} days, ${fmtInt(r.count)} HUs`} style={{ position: "relative", width: barW, height: PLOT_H }}>
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: barW,
                  height: bh,
                  background: T.outbound,
                  borderTopLeftRadius: 2,
                  borderTopRightRadius: 2,
                  transformOrigin: "bottom",
                  transition: glide,
                  ...(animate ? { transform: "scaleY(0)", animation: `deckBarGrow ${ANIM.barGrow}ms ${delay}ms ease-out forwards` } : {}),
                }}
              />
              {r.medianDays !== null && (
                <div style={{ position: "absolute", left: -3, width: barW + 6, bottom: h(r.medianDays) - 1.5, height: 3, background: T.heroText, transition: glide, ...entry(animate, "deckFadeIn", 250, delay + ANIM.markerDelay) }} />
              )}
              {r.avgDays !== null && (
                <div
                  style={{
                    position: "absolute",
                    bottom: Math.max(bh, h(r.medianDays ?? 0)) + 5,
                    left: barW / 2 - 25,
                    width: 50,
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: T.heroText,
                    transition: glide,
                    fontVariantNumeric: "tabular-nums",
                    ...entry(animate, "deckFadeIn", ANIM.labelIn, delay + ANIM.barGrow),
                  }}
                >
                  {fmtDec(r.avgDays)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 7 }}>
        {rows.map((r) => (
          <div key={r.key} style={{ width: barW + 28, textAlign: "center" }}>
            <div style={{ fontSize: 11.5, fontWeight: 500, color: T.heroText, whiteSpace: "nowrap" }}>{r.label}</div>
            <div style={{ fontSize: 10.5, color: T.textSecondary, marginTop: 1, whiteSpace: "nowrap" }}>{r.medianDays === null ? "" : `median ${fmtDays(r.medianDays)}`}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
