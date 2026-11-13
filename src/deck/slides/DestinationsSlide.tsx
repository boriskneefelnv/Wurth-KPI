import { useState } from "react";
import { fmtDec, fmtInt } from "../../core/slides/format";
import type { DestinationsSlideModel, DestinationsView } from "../../core/slides/destinations";
import type { StorageKey } from "../../core/slides/storage";
import { ANIM, entry, useAnimate, useTweenNumber } from "../anim";
import { PrincipalToggle } from "../PrincipalToggle";
import { SlideShell } from "../SlideShell";
import { T } from "../tokens";

const AVG = "#7DB73E";

/**
 * Storage per destination: the ten largest destinations by HUs shipped, as
 * horizontal bars of their average days in storage, against the average over
 * all destinations. Buttons switch between all principals and each principal.
 */
export function DestinationsSlide({ model, page, total }: { model: DestinationsSlideModel; page: number; total: number }) {
  const [key, setKey] = useState<StorageKey>("Total");
  const view = model.views[key];
  return (
    <SlideShell title={model.title} subtitle={view.headline} page={page} total={total}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <PrincipalToggle options={model.order.map((k) => ({ key: k, label: model.views[k].label }))} selected={key} onSelect={setKey} />
        <span style={{ fontSize: 11, color: T.textSecondary }}>HUs that left the warehouse in {model.period.label}, by destination country</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
        <Card index={0} label="Destinations" value={view.countries} sub={view.topShare === null ? "" : `Top ${view.top.length} take ${fmtInt(view.topShare)}% of HUs`} />
        <Card index={1} label="Average storage" value={view.avgDays} days sub={`Over ${fmtInt(view.hus)} HUs`} />
        <Card index={2} label="Longest storage" value={view.longest?.avgDays ?? null} days sub={view.longest ? `${view.longest.name} · ${fmtInt(view.longest.hus)} HUs` : "Too few destinations"} />
        <Card index={3} label="Shortest storage" value={view.shortest?.avgDays ?? null} days sub={view.shortest ? `${view.shortest.name} · ${fmtInt(view.shortest.hus)} HUs` : "Too few destinations"} />
      </div>
      <Chart view={view} ghostLabel={model.ghostLabel} />
    </SlideShell>
  );
}

function Card({ index, label, value, days, sub }: { index: number; label: string; value: number | null; days?: boolean; sub: string }) {
  const animate = useAnimate();
  const delay = index * ANIM.cardStagger;
  const n = useTweenNumber(value ?? 0, ANIM.count, delay);
  return (
    <div style={{ background: T.card, borderRadius: 6, boxShadow: T.cardShadow, borderTop: `3px solid ${T.heroText}`, padding: "11px 16px", ...entry(animate, "deckRiseIn", ANIM.cardIn, delay) }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: T.inbound, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 5 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: T.heroText, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>
          {value === null ? "n/a" : days ? fmtDec(n) : fmtInt(n)}
        </span>
        {value !== null && days && <span style={{ fontSize: 13, color: T.textSecondary }}>days</span>}
      </div>
      <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
    </div>
  );
}

function Chart({ view, ghostLabel }: { view: DestinationsView; ghostLabel: string | null }) {
  const animate = useAnimate();
  const rows = view.top;
  const max = Math.max(10, ...rows.map((r) => Math.max(r.avgDays, r.ghostAvg ?? 0)), view.avgDays ?? 0) * 1.12;
  const pct = (v: number) => `${(v / max) * 100}%`;
  const showGhost = rows.some((r) => r.ghostAvg !== null);
  const ROW_H = 28;
  const glide = `width ${ANIM.switch}ms ease-out, left ${ANIM.switch}ms ease-out`;
  return (
    <div style={{ flex: 1, minHeight: 0, background: T.card, borderRadius: 6, boxShadow: T.cardShadow, padding: "12px 22px 10px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: T.textSecondary }}>Top {rows.length} destinations by HUs · average days in storage</div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, fontWeight: 500, color: T.heroText }}>
          <Legend el={<span style={{ width: 11, height: 11, borderRadius: 2, background: T.bluePrimary }} />} label="Average days" />
          {showGhost && ghostLabel && <Legend el={<span style={{ width: 2, height: 12, background: T.heroText }} />} label={ghostLabel} />}
          <Legend el={<span style={{ width: 16, borderTop: `2px dashed ${AVG}` }} />} label="All destinations" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 70px 130px", columnGap: 14 }}>
        <span />
        <span />
        <ColHead>Avg days</ColHead>
        <ColHead>HUs · share</ColHead>
        {rows.map((r, i) => {
          const delay = i * ANIM.barStagger;
          return (
            <Row key={i}>
              <div style={{ height: ROW_H, display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 500, color: T.heroText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
              <div style={{ position: "relative", height: ROW_H }}>
                {view.avgDays !== null && (
                  <div style={{ position: "absolute", top: 0, height: ROW_H, left: pct(view.avgDays), borderLeft: `2px dashed ${AVG}`, zIndex: 1, transition: `left ${ANIM.switch}ms ease-out`, ...entry(animate, "deckFadeIn", 300, ANIM.barGrow + 300) }} />
                )}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 6,
                    height: ROW_H - 12,
                    width: pct(r.avgDays),
                    background: T.bluePrimary,
                    borderTopRightRadius: 2,
                    borderBottomRightRadius: 2,
                    transformOrigin: "left",
                    transition: glide,
                    ...(animate ? { transform: "scaleX(0)", animation: `deckGrowX ${ANIM.barGrow}ms ${delay}ms ease-out forwards` } : {}),
                  }}
                />
                {r.ghostAvg !== null && (
                  <div
                    title={`${fmtDec(r.ghostAvg)} days in ${ghostLabel ?? ""}`}
                    style={{ position: "absolute", top: 2, height: ROW_H - 4, width: 2, left: pct(r.ghostAvg), background: T.heroText, opacity: 0.75, transition: glide, ...entry(animate, "deckFadeIn", 250, delay + ANIM.markerDelay) }}
                  />
                )}
              </div>
              <div style={{ height: ROW_H, display: "flex", alignItems: "center", justifyContent: "flex-end", fontSize: 13, fontWeight: 700, color: T.heroText, fontVariantNumeric: "tabular-nums", ...entry(animate, "deckFadeIn", ANIM.labelIn, delay + ANIM.barGrow) }}>
                {fmtDec(r.avgDays)}
              </div>
              <div style={{ height: ROW_H, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, fontSize: 11.5, color: T.textSecondary, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                <strong style={{ color: T.heroText, fontWeight: 600 }}>{fmtInt(r.hus)}</strong> HUs · {fmtInt(r.share)}%
              </div>
            </Row>
          );
        })}
      </div>
      {view.avgDays !== null && rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 70px 130px", columnGap: 14, marginTop: 4 }}>
          <span />
          <div style={{ position: "relative", height: 14 }}>
            <span style={{ position: "absolute", left: pct(view.avgDays), transform: "translateX(-50%)", fontSize: 10, fontWeight: 700, color: "#4E8A22", whiteSpace: "nowrap", transition: `left ${ANIM.switch}ms ease-out` }}>
              Avg {fmtDec(view.avgDays)} days
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ColHead({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.textSecondary, textAlign: "right", paddingBottom: 2 }}>{children}</div>;
}

/** A grid row: its cells go straight into the parent grid. */
function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Legend({ el, label }: { el: React.ReactNode; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {el}
      {label}
    </span>
  );
}
