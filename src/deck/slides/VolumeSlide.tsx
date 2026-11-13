import { useState } from "react";
import { fmtInt } from "../../core/slides/format";
import type { ComparisonFigures, VolumePanel, VolumeSlideModel } from "../../core/slides/volume";
import { ANIM, entry, useAnimate, useTweenNumber } from "../anim";
import { SlideShell } from "../SlideShell";
import { FONT, T } from "../tokens";

/**
 * Volume slide in the original Würth layout: four hero figures on top, below
 * them a white card with inbound (dark) and outbound (light) bars per period.
 * The comparison period is drawn as a fine marker on each bar, so the chart
 * stays calm while the change is still visible.
 */
export function VolumeSlide({ model, page, total }: { model: VolumeSlideModel; page: number; total: number }) {
  const title = model.subject === "Total" ? "Total volume" : `${model.subject} volume`;
  return (
    <SlideShell title={title} page={page} total={total}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 18 }}>
        <Hero index={0} label="Inbound HUs" value={model.inbound.totalHus} changes={model.inbound.comparisons} pick="hus" fallback={perWorkday(model.inbound)} />
        <Hero index={1} label="Inbound rides" value={model.inbound.totalRides} changes={model.inbound.comparisons} pick="rides" fallback={perRide(model.inbound)} />
        <Hero index={2} label="Outbound HUs" value={model.outbound.totalHus} changes={model.outbound.comparisons} pick="hus" fallback={perWorkday(model.outbound)} />
        <Hero index={3} label="Outbound rides" value={model.outbound.totalRides} changes={model.outbound.comparisons} pick="rides" fallback={perRide(model.outbound)} />
      </div>
      <Chart model={model} />
    </SlideShell>
  );
}

const perWorkday = (p: VolumePanel) => (p.husPerWorkday === null ? "" : `${fmtInt(p.husPerWorkday)} per workday`);
const perRide = (p: VolumePanel) => (p.husPerRide === null ? "" : `${p.husPerRide.toLocaleString("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} HUs per ride`);

function Hero({
  index,
  label,
  value,
  changes,
  pick,
  fallback,
}: {
  index: number;
  label: string;
  value: number;
  changes: ComparisonFigures[];
  pick: "hus" | "rides";
  fallback: string;
}) {
  const animate = useAnimate();
  const delay = index * ANIM.cardStagger;
  const n = useTweenNumber(value, ANIM.count, delay);
  // One coloured pill for the main comparison (same period last year when
  // available), the other comparison as quiet text: calm, still complete.
  const deltas = changes
    .map((c) => ({ kind: c.kind, label: c.label, pct: pick === "hus" ? c.husDeltaPct : c.ridesDeltaPct }))
    .filter((d): d is { kind: ComparisonFigures["kind"]; label: string; pct: number } => d.pct !== null)
    .sort((a, b) => (a.kind === "lastYear" ? -1 : b.kind === "lastYear" ? 1 : 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", ...entry(animate, "deckRiseIn", ANIM.cardIn, delay) }}>
      <div style={{ width: 28, height: 2, background: T.inbound, marginBottom: 10 }} />
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: T.inbound, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 44, fontWeight: 700, color: T.heroText, lineHeight: 1, marginTop: 10, fontVariantNumeric: "tabular-nums" }}>
        {fmtInt(n)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9, minHeight: 20, ...entry(animate, "deckFadeIn", ANIM.badgeIn, ANIM.badgeDelay + delay) }}>
        {deltas.length ? (
          deltas.map((d, i) =>
            i === 0 ? (
              <Pill key={d.label} pct={d.pct} label={d.label} />
            ) : (
              <span key={d.label} style={{ fontSize: 11, color: T.textSecondary, alignSelf: "center" }}>
                {d.pct >= 0 ? "+" : "-"}
                {Math.abs(Math.round(d.pct))}% {d.label}
              </span>
            ),
          )
        ) : (
          <span style={{ fontSize: 11, color: T.textSecondary }}>{fallback}</span>
        )}
      </div>
    </div>
  );
}

function Pill({ pct, label }: { pct: number; label: string }) {
  const up = pct >= 2;
  const style = up ? { background: "#E8F4E1", color: "#3D7F1F" } : { background: "#E9EFF5", color: "#475569" };
  const sign = pct >= 0 ? "+" : "-";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 10, fontSize: 11, ...style }}>
      <strong style={{ fontWeight: 700 }}>
        {sign}
        {Math.abs(Math.round(pct))}%
      </strong>
      <span style={{ opacity: 0.85 }}>{label}</span>
    </span>
  );
}

/** Round the axis maximum up to a calm value (as in the original slides). */
function niceMax(raw: number): { max: number; ticks: number[] } {
  const target = Math.max(1, raw) * 1.15;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  const norm = target / mag;
  const step = (norm <= 1 ? 0.25 : norm <= 2 ? 0.5 : norm <= 5 ? 1 : 2) * mag;
  const max = Math.ceil(target / step) * step;
  return { max, ticks: [0, max / 4, max / 2, (max * 3) / 4, max] };
}

function Chart({ model }: { model: VolumeSlideModel }) {
  const animate = useAnimate();
  const [hover, setHover] = useState<number | null>(null);
  const n = model.buckets.length;
  const inArr = model.inbound.hus;
  const outArr = model.outbound.hus;
  const ghostIn = model.inbound.ghostHus;
  const ghostOut = model.outbound.ghostHus;
  const { max, ticks } = niceMax(Math.max(...inArr, ...outArr, ...(ghostIn ?? []), ...(ghostOut ?? [])));

  const PLOT_H = 282;
  const Y_W = 52;
  const barW = n <= 4 ? 52 : n <= 7 ? 40 : n <= 10 ? 26 : 20;
  const gap = 4;
  const groupW = barW * 2 + gap;
  const showValues = n <= 8;
  const per = model.period.kind === "week" ? "Per day" : model.period.kind === "month" ? "Per week" : "Per month";
  const h = (v: number) => (v > 0 ? Math.max(2, (v / max) * PLOT_H) : 0);

  return (
    <div style={{ flex: 1, minHeight: 0, background: T.card, borderRadius: 6, boxShadow: T.cardShadow, padding: "18px 24px 14px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.textSecondary }}>{per} · HUs inbound and outbound, rides below</div>
        <div style={{ display: "flex", gap: 18 }}>
          <Legend swatch={<span style={{ width: 12, height: 12, borderRadius: 2, background: T.inbound }} />} label="Inbound" />
          <Legend swatch={<span style={{ width: 12, height: 12, borderRadius: 2, background: T.outbound }} />} label="Outbound" />
          {model.ghost && <Legend swatch={<span style={{ width: 14, height: 2, background: T.heroText }} />} label={model.ghost.label} />}
        </div>
      </div>

      <div style={{ display: "flex", position: "relative" }}>
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
              <div key={t} style={{ position: "absolute", left: 0, right: 0, top: PLOT_H - (t / max) * PLOT_H, borderTop: `1px dashed ${T.gridline}`, opacity: t === 0 ? 1 : 0.6 }} />
            ))}
          </div>
          <div style={{ position: "relative", height: PLOT_H, display: "flex", justifyContent: "space-around", alignItems: "flex-end", padding: "0 12px" }}>
            {model.buckets.map((b, i) => {
              const delay = i * ANIM.barStagger;
              return (
                <div
                  key={b.key}
                  style={{ position: "relative", width: groupW, height: PLOT_H, display: "flex", alignItems: "flex-end", gap }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <Bar value={inArr[i]!} ghost={ghostIn?.[i] ?? null} height={h} color={T.inbound} width={barW} animate={animate} delay={delay} showValue={showValues} />
                  <Bar value={outArr[i]!} ghost={ghostOut?.[i] ?? null} height={h} color={T.outbound} width={barW} animate={animate} delay={delay + 40} showValue={showValues} />
                  {hover === i && (
                    <Tooltip
                      label={b.label}
                      left={groupW / 2}
                      bottom={Math.max(h(inArr[i]!), h(outArr[i]!)) + 26}
                      rows={[
                        [`Inbound · ${fmtInt(model.inbound.rides[i]!)} rides`, inArr[i]!, ghostIn?.[i]],
                        [`Outbound · ${fmtInt(model.outbound.rides[i]!)} rides`, outArr[i]!, ghostOut?.[i]],
                      ]}
                      ghostLabel={model.ghost?.label}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ position: "relative", display: "flex", justifyContent: "space-around", padding: "0 12px", marginTop: 6 }}>
            <div style={{ position: "absolute", left: -Y_W, width: Y_W - 10, textAlign: "right", top: 1, fontSize: 10, color: T.axis }}>Rides</div>
            {model.buckets.map((b, i) => (
              <div key={b.key} style={{ width: groupW, display: "flex", gap, ...entry(animate, "deckFadeIn", ANIM.labelIn, i * ANIM.barStagger + ANIM.barGrow) }}>
                {[model.inbound.rides[i]!, model.outbound.rides[i]!].map((r, k) => (
                  <div key={k} style={{ width: barW, textAlign: "center", fontSize: 11, fontWeight: 600, color: k === 0 ? T.inbound : "#3B87B8", fontVariantNumeric: "tabular-nums" }}>
                    {showValues || barW >= 20 ? fmtInt(r) : ""}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", padding: "0 12px", marginTop: 6 }}>
            {model.buckets.map((b) => (
              <div key={b.key} style={{ width: groupW, textAlign: "center", fontSize: 12, fontWeight: 500, color: T.heroText, whiteSpace: "nowrap" }}>
                {b.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bar({
  value,
  ghost,
  height,
  color,
  width,
  animate,
  delay,
  showValue,
}: {
  value: number;
  ghost: number | null;
  height: (v: number) => number;
  color: string;
  width: number;
  animate: boolean;
  delay: number;
  showValue: boolean;
}) {
  const bh = height(value);
  return (
    <div style={{ position: "relative", width, height: "100%" }}>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width,
          height: bh,
          background: color,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2,
          transformOrigin: "bottom",
          ...(animate ? { transform: "scaleY(0)", animation: `deckBarGrow ${ANIM.barGrow}ms ${delay}ms ease-out forwards` } : {}),
        }}
      />
      {ghost !== null && ghost > 0 && (
        <div
          title={fmtInt(ghost)}
          style={{
            position: "absolute",
            left: -3,
            width: width + 6,
            bottom: height(ghost) - 1,
            height: 2,
            background: T.heroText,
            opacity: 0.75,
            ...entry(animate, "deckFadeIn", 250, delay + ANIM.markerDelay),
          }}
        />
      )}
      {showValue && (
        <div
          style={{
            position: "absolute",
            bottom: Math.max(bh, ghost !== null ? height(ghost) : 0) + 5,
            left: width / 2 - 30,
            width: 60,
            textAlign: "center",
            fontSize: 11,
            fontWeight: 600,
            color: T.heroText,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            ...entry(animate, "deckFadeIn", ANIM.labelIn, delay + ANIM.barGrow),
          }}
        >
          {fmtInt(value)}
        </div>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 500, color: T.heroText }}>
      <span style={{ display: "inline-flex", alignItems: "center" }}>{swatch}</span>
      {label}
    </div>
  );
}

function Tooltip({
  label,
  left,
  bottom,
  rows,
  ghostLabel,
}: {
  label: string;
  left: number;
  bottom: number;
  rows: [string, number, number | null | undefined][];
  ghostLabel?: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: left - 135,
        bottom,
        width: 270,
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
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {rows.map(([name, v, g]) => (
        <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span>{name}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            <strong>{fmtInt(v)}</strong>
            {g != null && ghostLabel ? <span style={{ color: T.textSecondary }}> ({fmtInt(g)} in {ghostLabel})</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}
