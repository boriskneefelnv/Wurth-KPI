import { fmtDec } from "../../core/slides/format";
import type { PunctualitySlideModel } from "../../core/slides/punctuality";
import { ANIM, entry, useAnimate, useTweenNumber } from "../anim";
import { SlideShell } from "../SlideShell";
import { T } from "../tokens";

const BAD = "#D4884A"; // below target (as in the original slide)
const TARGET = "#7DB73E";

/**
 * On time slide (loading or stocking): one large percentage against the
 * target with the principals as small figures, and one chart per period with
 * the target line. Calm by design: one message, one chart.
 */
export function PunctualitySlide({ model, page, total }: { model: PunctualitySlideModel; page: number; total: number }) {
  const subtitle = [model.headline, model.context].filter(Boolean).join(" ");
  return (
    <SlideShell title={model.title} subtitle={subtitle} page={page} total={total}>
      <Hero model={model} />
      <Chart model={model} />
    </SlideShell>
  );
}

const pctText = (x: number | null) => (x === null ? "n/a" : `${fmtDec(x)}%`);

function Hero({ model }: { model: PunctualitySlideModel }) {
  const animate = useAnimate();
  const n = useTweenNumber(model.pct ?? 0, ANIM.count);
  const ok = model.meetsTarget;
  return (
    <div
      style={{
        background: T.card,
        borderRadius: 6,
        boxShadow: T.cardShadow,
        padding: "20px 28px",
        display: "grid",
        gridTemplateColumns: "1.25fr 1fr 0.8fr 1.6fr",
        alignItems: "center",
        gap: 28,
        marginBottom: 16,
        ...entry(animate, "deckRiseIn", ANIM.cardIn, 0),
      }}
    >
      <div>
        <div style={{ width: 28, height: 2, background: T.inbound, marginBottom: 10 }} />
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: T.inbound, textTransform: "uppercase" }}>{model.label}</div>
        <div style={{ fontSize: 60, fontWeight: 700, color: T.heroText, lineHeight: 1, marginTop: 10, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
          {model.pct === null ? "n/a" : `${fmtDec(n)}%`}
        </div>
        <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 8 }}>
          {model.ok.toLocaleString("nl-NL")} of {model.measured.toLocaleString("nl-NL")} rides
          {model.secondary && model.secondary.pct !== null && (
            <>
              {" · "}
              {model.secondary.label.toLowerCase()} <strong style={{ color: T.heroText }}>{pctText(model.secondary.pct)}</strong>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, ...entry(animate, "deckFadeIn", ANIM.badgeIn, ANIM.badgeDelay) }}>
        {model.comparisons.map((c) => (
          <div key={c.kind} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.textSecondary }}>
            <Delta pts={c.deltaPts} />
            <span>{c.label}</span>
            <span style={{ color: T.textSecondary, opacity: 0.8 }}>({pctText(c.pct)})</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, ...entry(animate, "deckFadeIn", ANIM.badgeIn, ANIM.badgeDelay + 100) }}>
        <div style={{ fontSize: 12, color: T.textSecondary }}>Target {model.target}%</div>
        {ok !== null && (
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              background: ok ? "#E8F4E1" : "#FBEFE4",
              color: ok ? "#3D7F1F" : "#B5652B",
            }}
          >
            {ok ? "Achieved" : "Below target"}
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {model.perPrincipal.map((p, i) => (
          <div key={p.principal} style={{ borderLeft: `1px solid ${T.borderSubtle}`, paddingLeft: 14, ...entry(animate, "deckRiseIn", ANIM.cardIn, 200 + i * ANIM.cardStagger) }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: T.inbound, textTransform: "uppercase", whiteSpace: "nowrap" }}>{p.principal}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: T.heroText, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{pctText(p.pct)}</div>
            <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>
              {p.ok.toLocaleString("nl-NL")} / {p.measured.toLocaleString("nl-NL")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Delta({ pts }: { pts: number | null }) {
  if (pts === null) return <span style={{ minWidth: 70 }}>n/a</span>;
  const stable = Math.abs(pts) < 0.05;
  const up = pts > 0;
  const style = stable ? { background: "#E9EFF5", color: "#475569" } : up ? { background: "#E8F4E1", color: "#3D7F1F" } : { background: "#FBEFE4", color: "#B5652B" };
  return (
    <span style={{ padding: "3px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, minWidth: 70, textAlign: "center", ...style }}>
      {stable ? "0,0" : `${up ? "+" : "-"}${fmtDec(Math.abs(pts))}`} pts
    </span>
  );
}

function Chart({ model }: { model: PunctualitySlideModel }) {
  const animate = useAnimate();
  const values = model.buckets.flatMap((b) => [b.pct, b.ghostPct]).filter((v): v is number => v !== null);
  const low = Math.min(model.target, ...values);
  const yMax = 100;
  // Axis from 100% down in steps of 5 (or 10 for a wide range), always ending at a tick.
  const step = low - 5 >= 70 ? 5 : 10;
  const yMin = Math.max(0, yMax - Math.ceil((yMax - (low - 5)) / step) * step);
  const ticks: number[] = [];
  for (let t = yMax; t >= yMin; t -= step) ticks.push(t);
  const PLOT_H = 232;
  const Y_W = 46;
  const n = model.buckets.length;
  const barW = n <= 4 ? 64 : n <= 7 ? 48 : n <= 10 ? 32 : 26;
  const y = (v: number) => PLOT_H - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * PLOT_H;
  const per = model.period.kind === "week" ? "Per day" : model.period.kind === "month" ? "Per week" : "Per month";

  return (
    <div style={{ flex: 1, minHeight: 0, background: T.card, borderRadius: 6, boxShadow: T.cardShadow, padding: "18px 24px 14px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.textSecondary }}>{per} · share of rides on time</div>
        <div style={{ display: "flex", gap: 18, fontSize: 11, fontWeight: 500, color: T.heroText }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: T.inbound }} />
            On or above target
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: BAD }} />
            Below target
          </span>
          {model.ghost && (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 14, height: 2, background: T.heroText }} />
              {model.ghost.label}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", position: "relative" }}>
        <div style={{ width: Y_W, position: "relative", height: PLOT_H }}>
          {ticks.map((t) => (
            <div key={t} style={{ position: "absolute", right: 10, top: y(t) - 6, fontSize: 10, color: T.axis }}>
              {t}%
            </div>
          ))}
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: PLOT_H }}>
            {ticks.map((t) => (
              <div key={t} style={{ position: "absolute", left: 0, right: 0, top: y(t), borderTop: `1px dashed ${T.gridline}`, opacity: t === yMin ? 1 : 0.6 }} />
            ))}
            <div style={{ position: "absolute", left: 0, right: 0, top: y(model.target), borderTop: `2px dashed ${TARGET}`, ...entry(animate, "deckFadeIn", 300, 200) }} />
            <div
              style={{
                position: "absolute",
                right: 0,
                top: y(model.target) - 18,
                fontSize: 11,
                fontWeight: 600,
                color: TARGET,
                background: T.card,
                paddingLeft: 6,
                ...entry(animate, "deckFadeIn", 300, 200),
              }}
            >
              Target {model.target}%
            </div>
          </div>
          <div style={{ position: "relative", height: PLOT_H, display: "flex", justifyContent: "space-around", alignItems: "flex-end", padding: "0 60px 0 12px" }}>
            {model.buckets.map((b, i) => {
              const delay = i * ANIM.barStagger;
              const below = b.pct !== null && b.pct < model.target;
              const h = b.pct === null ? 0 : PLOT_H - y(b.pct);
              return (
                <div key={b.key} title={b.pct === null ? "" : `${b.label}: ${fmtDec(b.pct)}% (${b.measured} rides)`} style={{ position: "relative", width: barW, height: PLOT_H }}>
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      width: barW,
                      height: Math.max(b.pct === null ? 0 : 2, h),
                      background: below ? BAD : T.inbound,
                      borderTopLeftRadius: 2,
                      borderTopRightRadius: 2,
                      transformOrigin: "bottom",
                      ...(animate ? { transform: "scaleY(0)", animation: `deckBarGrow ${ANIM.barGrow}ms ${delay}ms ease-out forwards` } : {}),
                    }}
                  />
                  {b.ghostPct !== null && (
                    <div
                      title={`${model.ghost?.label}: ${fmtDec(b.ghostPct)}%`}
                      style={{
                        position: "absolute",
                        left: -4,
                        width: barW + 8,
                        top: y(b.ghostPct) - 1,
                        height: 2,
                        background: T.heroText,
                        opacity: 0.75,
                        ...entry(animate, "deckFadeIn", 250, delay + ANIM.markerDelay),
                      }}
                    />
                  )}
                  {b.pct !== null && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: Math.max(h, b.ghostPct !== null ? PLOT_H - y(b.ghostPct) : 0) + 6,
                        left: barW / 2 - 32,
                        width: 64,
                        textAlign: "center",
                        fontSize: 11,
                        fontWeight: 600,
                        color: below ? "#B5652B" : T.heroText,
                        fontVariantNumeric: "tabular-nums",
                        ...entry(animate, "deckFadeIn", ANIM.labelIn, delay + ANIM.barGrow),
                      }}
                    >
                      {fmtDec(b.pct)}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", padding: "0 60px 0 12px", marginTop: 8 }}>
            {model.buckets.map((b) => (
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
