import { useState } from "react";
import { fmtInt } from "../../core/slides/format";
import type { MixKey, MixSlideModel, MixView } from "../../core/slides/containerMix";
import type { MainPrincipal } from "../../core/types";
import { ANIM, entry, useAnimate, useTweenNumber } from "../anim";
import { PrincipalToggle } from "../PrincipalToggle";
import { SlideShell } from "../SlideShell";
import { FONT, T } from "../tokens";

const PART_COLOR: Record<MainPrincipal | "Other", string> = { WIAG: "#1E5478", AWKG: "#4FA0D4", "Liqui Moly": "#7DB73E", Other: "#B8C4D0" };

/**
 * Container mix: outbound containers (rides) per container type as
 * horizontal bars, split by principal in the all principals view, with last
 * year as a marker. Buttons switch between all principals and each principal.
 */
export function ContainerMixSlide({ model, page, total }: { model: MixSlideModel; page: number; total: number }) {
  const [key, setKey] = useState<MixKey>("Total");
  const view = model.views[key];
  return (
    <SlideShell
      title={model.title}
      topBar={<PrincipalToggle options={model.order.map((k) => ({ key: k, label: model.views[k].label }))} selected={key} onSelect={setKey} />}
      page={page}
      total={total}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
        <Card index={0} label="Containers outbound" value={view.rides} delta={view.ridesDeltaPct} deltaLabel={model.comparisonLabel} sub="Outbound rides" />
        <Card index={1} label="TEU" value={view.teu} sub="20ft = 1, 40ft = 2" />
        <Card index={2} label="Full containers" value={view.fullShare} pct sub="20ft and 40ft" />
        <Card index={3} label="LCL" value={view.lclShare} pct sub={view.otherShare ? `Air, FCA and unknown: ${view.otherShare < 1 ? "<1" : fmtInt(view.otherShare)}%` : "Part loads"} />
      </div>
      <Chart model={model} view={view} />
    </SlideShell>
  );
}

function Card({ index, label, value, pct, sub, delta, deltaLabel }: { index: number; label: string; value: number | null; pct?: boolean; sub: string; delta?: number | null; deltaLabel?: string | null }) {
  const animate = useAnimate();
  const delay = index * ANIM.cardStagger;
  const n = useTweenNumber(value ?? 0, ANIM.count, delay);
  return (
    <div style={{ background: T.card, borderRadius: 6, boxShadow: T.cardShadow, borderTop: `3px solid ${T.heroText}`, padding: "11px 16px", ...entry(animate, "deckRiseIn", ANIM.cardIn, delay) }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: T.inbound, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: T.heroText, lineHeight: 1.05, marginTop: 5, fontVariantNumeric: "tabular-nums" }}>
        {value === null ? "n/a" : `${fmtInt(n)}${pct ? "%" : ""}`}
      </div>
      <div style={{ marginTop: 6, minHeight: 19, ...entry(animate, "deckFadeIn", ANIM.badgeIn, ANIM.badgeDelay + delay) }}>
        {delta != null && deltaLabel ? (
          <span style={{ display: "inline-flex", gap: 5, padding: "2px 8px", borderRadius: 10, fontSize: 10.5, whiteSpace: "nowrap", ...(delta >= 2 ? { background: "#E8F4E1", color: "#3D7F1F" } : { background: "#E9EFF5", color: "#475569" }) }}>
            <strong>
              {delta >= 0 ? "+" : "-"}
              {Math.abs(Math.round(delta))}%
            </strong>
            <span style={{ opacity: 0.85 }}>{deltaLabel}</span>
          </span>
        ) : (
          <span style={{ fontSize: 11, color: T.textSecondary, whiteSpace: "nowrap" }}>{sub}</span>
        )}
      </div>
    </div>
  );
}

function Chart({ model, view }: { model: MixSlideModel; view: MixView }) {
  const animate = useAnimate();
  const [hover, setHover] = useState<number | null>(null);
  const rows = view.rows;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.rides, r.ghost ?? 0))) * 1.08;
  const pct = (v: number) => `${(v / max) * 100}%`;
  const ROW_H = Math.min(48, Math.floor(330 / Math.max(1, rows.length)));
  const glide = `width ${ANIM.switch}ms ease-out, left ${ANIM.switch}ms ease-out`;
  const stacked = rows.some((r) => r.parts);
  const used = new Set(rows.flatMap((r) => (r.parts ?? []).map((p) => p.principal)));
  const showGhost = rows.some((r) => r.ghost !== null);
  const cols = "220px 1fr 70px 70px";
  return (
    <div style={{ flex: 1, minHeight: 0, background: T.card, borderRadius: 6, boxShadow: T.cardShadow, padding: "12px 22px 10px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: T.textSecondary }}>Outbound containers per type</div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, fontWeight: 500, color: T.heroText }}>
          {stacked ? (
            (Object.keys(PART_COLOR) as (MainPrincipal | "Other")[]).filter((p) => used.has(p)).map((p) => <Legend key={p} el={<span style={{ width: 11, height: 11, borderRadius: 2, background: PART_COLOR[p] }} />} label={p} />)
          ) : (
            <Legend el={<span style={{ width: 11, height: 11, borderRadius: 2, background: T.bluePrimary }} />} label="Containers" />
          )}
          {showGhost && model.ghostLabel && <Legend el={<span style={{ width: 2, height: 12, background: T.heroText }} />} label={model.ghostLabel} />}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: cols, columnGap: 14, alignItems: "end" }}>
        <span />
        <span />
        <ColHead>Containers</ColHead>
        <ColHead>Share</ColHead>
      </div>
      {rows.map((r, i) => {
        const delay = i * ANIM.barStagger;
        let left = 0;
        const parts = r.parts ?? [{ principal: null, rides: r.rides }];
        return (
          <div
            key={r.type}
            style={{ display: "grid", gridTemplateColumns: cols, columnGap: 14, alignItems: "center", height: ROW_H, borderTop: i ? "1px solid #EEF2F6" : undefined, position: "relative" }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
              <span style={{ minWidth: 34, padding: "2px 0", textAlign: "center", borderRadius: 3, background: "#E9EFF5", color: T.heroText, fontSize: 11, fontWeight: 700 }}>{r.code}</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: T.heroText }}>{r.label}</span>
            </div>
            <div style={{ position: "relative", height: ROW_H - 16 }}>
              <div style={{ position: "absolute", inset: 0, transformOrigin: "left", ...(animate ? { transform: "scaleX(0)", animation: `deckGrowX ${ANIM.barGrow}ms ${delay}ms ease-out forwards` } : {}) }}>
                {parts.map((p, k) => {
                  const l = left;
                  left += p.rides;
                  return (
                    <div
                      key={p.principal ?? k}
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: pct(l),
                        width: pct(p.rides),
                        background: p.principal ? PART_COLOR[p.principal] : T.bluePrimary,
                        borderRight: k < parts.length - 1 ? "1px solid #fff" : undefined,
                        borderTopRightRadius: k === parts.length - 1 ? 2 : 0,
                        borderBottomRightRadius: k === parts.length - 1 ? 2 : 0,
                        transition: glide,
                      }}
                    />
                  );
                })}
              </div>
              {r.ghost !== null && r.ghost > 0 && (
                <div style={{ position: "absolute", top: -3, bottom: -3, width: 2, left: pct(r.ghost), background: T.heroText, opacity: 0.75, transition: glide, ...entry(animate, "deckFadeIn", 250, delay + ANIM.markerDelay) }} />
              )}
            </div>
            <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: T.heroText, fontVariantNumeric: "tabular-nums" }}>{fmtInt(r.rides)}</div>
            <div style={{ textAlign: "right", fontSize: 12, color: T.textSecondary, fontVariantNumeric: "tabular-nums" }}>{r.share > 0 && r.share < 1 ? "<1%" : `${fmtInt(r.share)}%`}</div>
            {hover === i && <Tip model={model} r={r} />}
          </div>
        );
      })}
    </div>
  );
}

function Tip({ model, r }: { model: MixSlideModel; r: MixView["rows"][number] }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 240,
        bottom: "100%",
        width: 230,
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
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {r.code} · {r.label}
      </div>
      <Line label="Containers" value={fmtInt(r.rides)} bold />
      {(r.parts ?? []).map((p) => (
        <Line key={p.principal} label={p.principal} value={fmtInt(p.rides)} />
      ))}
      {r.ghost !== null && model.ghostLabel && <Line label={model.ghostLabel} value={fmtInt(r.ghost)} />}
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", color: bold ? T.heroText : T.textSecondary }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: bold ? 700 : 400 }}>{value}</span>
    </div>
  );
}

function ColHead({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.textSecondary, textAlign: "right", paddingBottom: 2 }}>{children}</div>;
}

function Legend({ el, label }: { el: React.ReactNode; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {el}
      {label}
    </span>
  );
}
