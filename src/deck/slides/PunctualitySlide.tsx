import { fmtDec } from "../../core/slides/format";
import type { PunctualitySlideModel } from "../../core/slides/punctuality";
import type { MainPrincipal } from "../../core/types";
import { ANIM, entry, useAnimate, useTweenNumber } from "../anim";
import { useFocus } from "../focus";
import { PrincipalToggle } from "../PrincipalToggle";
import { SlideShell } from "../SlideShell";
import { T } from "../tokens";

/** Principal blues of the original on time slide. */
const PRINCIPAL_BLUE: Record<MainPrincipal, string> = { WIAG: "#1E5478", AWKG: "#2A7AB0", "Liqui Moly": "#4FA0D4" };
const TARGET = "#7DB73E";
const BELOW = "#B5652B";

/**
 * On time slide (loading or stocking), after the original Würth layout but
 * tighter: one row with all principals together and each principal, then the
 * monthly chart per principal with the target line.
 */
export function PunctualitySlide({ model, page, total }: { model: PunctualitySlideModel; page: number; total: number }) {
  const focus = useFocus();
  return (
    <SlideShell title={model.title} topBar={focus ? <PrincipalToggle options={[]} selected="" onSelect={() => {}} /> : undefined} page={page} total={total}>
      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card
          index={0}
          accent={T.heroText}
          label={focus ?? "All principals"}
          pct={model.pct}
          sub={`${model.ok.toLocaleString("nl-NL")} / ${model.measured.toLocaleString("nl-NL")} rides`}
          deltaPts={model.deltaPts}
          deltaLabel={model.deltaLabel}
          below={model.meetsTarget === false}
          extra={
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <span style={{ fontSize: 11, color: T.textSecondary }}>Target {model.target}%</span>
              {model.meetsTarget !== null && (
                <span
                  style={{
                    padding: "3px 9px",
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 600,
                    background: model.meetsTarget ? "#E8F4E1" : "#FBEFE4",
                    color: model.meetsTarget ? "#3D7F1F" : BELOW,
                  }}
                >
                  {model.meetsTarget ? "Achieved" : "Below target"}
                </span>
              )}
              {!focus && model.secondary && model.secondary.pct !== null && (
                <span style={{ fontSize: 11, color: T.textSecondary, whiteSpace: "nowrap" }}>
                  {model.secondary.label}: <strong style={{ color: T.heroText }}>{fmtDec(model.secondary.pct)}%</strong>
                </span>
              )}
            </div>
          }
        />
        {focus && (
          <>
            <Stat index={1} label="Rides measured" value={model.measured} />
            {model.kind === "loading" ? (
              <>
                <Stat index={2} label="Late rides" value={model.late.total} />
                <Stat index={3} label="Late by one workday" value={model.late.oneWorkday} />
              </>
            ) : (
              <>
                <Stat index={2} label="Over one workday" value={model.late.total} />
                <Stat index={3} label="On the unloading day" value={model.secondary?.pct ?? 0} pct />
              </>
            )}
          </>
        )}
        {!focus && model.perPrincipal.map((p, i) => (
          <Card
            key={p.principal}
            index={i + 1}
            accent={PRINCIPAL_BLUE[p.principal]}
            label={p.principal}
            pct={p.pct}
            sub={`${p.ok.toLocaleString("nl-NL")} / ${p.measured.toLocaleString("nl-NL")} rides`}
            deltaPts={p.deltaPts}
            deltaLabel={model.deltaLabel}
            below={p.pct !== null && p.pct < model.target}
          />
        ))}
      </div>
      <Chart model={model} principals={focus ? [focus] : PRINCIPALS} />
    </SlideShell>
  );
}

function Card({
  index,
  accent,
  label,
  pct,
  sub,
  deltaPts,
  deltaLabel,
  below,
  extra,
}: {
  index: number;
  accent: string;
  label: string;
  pct: number | null;
  sub: string;
  deltaPts: number | null;
  deltaLabel: string | null;
  below: boolean;
  extra?: React.ReactNode;
}) {
  const animate = useAnimate();
  const delay = index * ANIM.cardStagger;
  const n = useTweenNumber(pct ?? 0, ANIM.count, delay);
  return (
    <div
      style={{
        background: T.card,
        borderRadius: 6,
        boxShadow: T.cardShadow,
        borderTop: `3px solid ${accent}`,
        padding: "12px 16px 12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        ...entry(animate, "deckRiseIn", ANIM.cardIn, delay),
      }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: T.inbound, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: below ? BELOW : T.heroText, lineHeight: 1.05, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
          {pct === null ? "n/a" : `${fmtDec(n)}%`}
        </div>
        <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 4 }}>{sub}</div>
        <div style={{ marginTop: 7, minHeight: 19, ...entry(animate, "deckFadeIn", ANIM.badgeIn, ANIM.badgeDelay + delay) }}>
          {deltaPts !== null && deltaLabel && <Delta pts={deltaPts} label={deltaLabel} />}
        </div>
      </div>
      {extra}
    </div>
  );
}

function Delta({ pts, label }: { pts: number; label: string }) {
  const stable = Math.abs(pts) < 0.05;
  const up = pts > 0;
  const style = stable ? { background: "#E9EFF5", color: "#475569" } : up ? { background: "#E8F4E1", color: "#3D7F1F" } : { background: "#FBEFE4", color: BELOW };
  return (
    <span style={{ display: "inline-flex", gap: 5, padding: "2px 8px", borderRadius: 10, fontSize: 10.5, whiteSpace: "nowrap", ...style }}>
      <strong>{stable ? "0,0" : `${up ? "+" : "-"}${fmtDec(Math.abs(pts))}`} pts</strong>
      <span style={{ opacity: 0.85 }}>{label}</span>
    </span>
  );
}

const PRINCIPALS: MainPrincipal[] = ["WIAG", "AWKG", "Liqui Moly"];

/** Bar label: one decimal, but a clean "100%" so neighbouring labels never touch. */
const barValue = (v: number) => (v >= 99.95 ? "100%" : `${fmtDec(v)}%`);

function Chart({ model, principals: PRINCIPALS }: { model: PunctualitySlideModel; principals: MainPrincipal[] }) {
  const animate = useAnimate();
  const values = model.buckets.flatMap((b) => PRINCIPALS.map((p) => b.perPrincipal[p])).filter((v): v is number => v !== null);
  const low = Math.min(model.target, ...values);
  const yMax = 100;
  const step = low - 5 >= 70 ? 5 : 10;
  const yMin = Math.max(50, yMax - Math.ceil((yMax - (low - 5)) / step) * step);
  const ticks: number[] = [];
  for (let t = yMax; t >= yMin; t -= step) ticks.push(t);
  const PLOT_H = 274;
  const Y_W = 44;
  const n = model.buckets.length;
  // One principal (a deck for one entity): wider bars with their values.
  const single = PRINCIPALS.length === 1;
  const barW = single ? (n <= 6 ? 56 : n <= 9 ? 44 : n <= 13 ? 30 : 16) : n <= 3 ? 44 : n <= 6 ? 32 : n <= 9 ? 20 : 13;
  const gap = n <= 6 ? 6 : 3;
  const showValues = single ? n <= 13 : n <= 6;
  const y = (v: number) => PLOT_H - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * PLOT_H;
  const per = model.period.kind === "week" ? "Per day" : model.period.kind === "month" ? "Per week" : "Per month";

  return (
    <div style={{ flex: 1, minHeight: 0, background: T.card, borderRadius: 6, boxShadow: T.cardShadow, padding: "14px 22px 10px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: T.textSecondary }}>{per}{single ? "" : " · per principal"}</div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, fontWeight: 500, color: T.heroText }}>
          {PRINCIPALS.map((p) => (
            <span key={p} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 11, height: 11, borderRadius: 2, background: PRINCIPAL_BLUE[p] }} />
              {p}
            </span>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 16, borderTop: `2px dashed ${TARGET}` }} />
            Target {model.target}%
          </span>
        </div>
      </div>

      <div style={{ display: "flex" }}>
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
              <div key={t} style={{ position: "absolute", left: 0, right: 0, top: y(t), borderTop: `1px dashed ${T.gridline}`, opacity: t === yMin ? 1 : 0.55 }} />
            ))}
            <div style={{ position: "absolute", left: 0, right: 0, top: y(model.target), borderTop: `2px dashed ${TARGET}`, ...entry(animate, "deckFadeIn", 300, 200) }} />
          </div>
          <div style={{ position: "relative", height: PLOT_H, display: "flex", justifyContent: "space-around", alignItems: "flex-end", padding: "0 8px" }}>
            {model.buckets.map((b, gi) => (
              <div key={b.key} style={{ display: "flex", alignItems: "flex-end", gap, height: PLOT_H }}>
                {PRINCIPALS.map((p, bi) => {
                  const v = b.perPrincipal[p];
                  const delay = (gi * 3 + bi) * 40;
                  const h = v === null ? 0 : Math.max(2, PLOT_H - y(v));
                  const below = v !== null && v < model.target;
                  return (
                    <div key={p} title={v === null ? `${p}: no rides` : `${p} ${b.label}: ${fmtDec(v)}%`} style={{ position: "relative", width: barW, height: PLOT_H }}>
                      {v !== null && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            width: barW,
                            height: h,
                            background: PRINCIPAL_BLUE[p],
                            borderTopLeftRadius: 2,
                            borderTopRightRadius: 2,
                            transformOrigin: "bottom",
                            ...(animate ? { transform: "scaleY(0)", animation: `deckBarGrow ${ANIM.barGrow}ms ${delay}ms ease-out forwards` } : {}),
                          }}
                        />
                      )}
                      {showValues && v !== null && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: h + 3,
                            left: "50%",
                            transform: "translateX(-50%)",
                            padding: "0 2px",
                            background: T.card,
                            borderRadius: 2,
                            whiteSpace: "nowrap",
                            lineHeight: "14px",
                            fontSize: 10,
                            fontWeight: 600,
                            color: below ? BELOW : T.heroText,
                            fontVariantNumeric: "tabular-nums",
                            ...entry(animate, "deckFadeIn", ANIM.labelIn, delay + ANIM.barGrow),
                          }}
                        >
                          {barValue(v)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", padding: "0 8px", marginTop: 8 }}>
            {model.buckets.map((b) => (
              <div key={b.key} style={{ width: Math.max(80, barW * PRINCIPALS.length + gap * (PRINCIPALS.length - 1)), textAlign: "center", whiteSpace: "nowrap" }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: T.heroText }}>{b.label}</div>
                <div style={{ fontSize: 10.5, color: b.pct !== null && b.pct < model.target ? BELOW : T.textSecondary, marginTop: 2 }}>
                  {b.pct === null ? "" : `Total ${barValue(b.pct)}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ index, label, value, pct }: { index: number; label: string; value: number; pct?: boolean }) {
  const animate = useAnimate();
  const delay = index * ANIM.cardStagger;
  const n = useTweenNumber(value, ANIM.count, delay);
  return (
    <div style={{ background: T.card, borderRadius: 6, boxShadow: T.cardShadow, borderTop: `3px solid ${T.heroText}`, padding: "12px 16px", ...entry(animate, "deckRiseIn", ANIM.cardIn, delay) }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: T.inbound, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: T.heroText, lineHeight: 1.05, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{pct ? `${fmtDec(n)}%` : Math.round(n).toLocaleString("nl-NL")}</div>
    </div>
  );
}
