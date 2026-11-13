import { useState } from "react";
import type { ComplaintCategory } from "../../core/complaints/portal";
import type { ComplaintKey } from "../../core/report/complaints";
import type { ComplaintsSlideModel, ComplaintsView } from "../../core/slides/complaints";
import { fmtDec, fmtInt } from "../../core/slides/format";
import { ANIM, entry, useAnimate, useTweenNumber } from "../anim";
import { PrincipalToggle } from "../PrincipalToggle";
import { SlideShell } from "../SlideShell";
import { FONT, T } from "../tokens";

/** Not assessed yet: striped yellow everywhere, so it is clear the assessment is still to be done. */
const PENDING = "repeating-linear-gradient(135deg, #E9B949 0 4px, #FCEBB6 4px 8px)";
const ORIGIN = { sales: "#2A7AB0", vendor: "#1E5478", unassessed: PENDING } as const;
const VERDICT = { accepted: "#D4884A", open: PENDING, denied: "#DCE3EA" } as const;
const PENDING_BADGE = { background: "#FFF6D6", color: "#8A6100", boxShadow: "inset 0 0 0 1px #E9B949" } as const;
const BELOW = "#B5652B";

function useView(model: ComplaintsSlideModel) {
  const [key, setKey] = useState<ComplaintKey>("Total");
  const toggle = <PrincipalToggle options={model.order.map((k) => ({ key: k, label: model.views[k].label }))} selected={key} onSelect={setKey} />;
  return { view: model.views[key], toggle };
}

/** Complaints: rides and HUs without complaint against the target, complaints per month by Sales and Vendor. */
export function ComplaintsOverviewSlide({ model, page, total }: { model: ComplaintsSlideModel; page: number; total: number }) {
  const { view, toggle } = useView(model);
  return (
    <SlideShell title="Complaints" topBar={toggle} page={page} total={total}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
        <PctCard index={0} label="Rides without complaint" level={view.rides} target={model.target} unit="rides" deltaLabel={model.comparisonLabel} />
        <PctCard index={1} label="HUs without complaint" level={view.hus} target={model.target} unit="HUs" deltaLabel={model.comparisonLabel} />
        <CountCard
          index={2}
          label="Complaints"
          value={view.counted}
          sub={[view.warehouse ? `${view.warehouse} in the warehouse` : null, view.denied ? `${view.denied} denied, not counted` : null].filter(Boolean).join(" · ") || "Not denied"}
          badge={view.open ? `${view.open} not assessed yet` : null}
        />
        <CountCard index={3} label="Pallets affected" value={view.palletsAffected} sub="In complaints that count" />
      </div>
      <PerMonth model={model} view={view} />
    </SlideShell>
  );
}

/** Complaints by type (accepted, not assessed, denied) and the latest complaints. */
export function ComplaintsByTypeSlide({ model, page, total }: { model: ComplaintsSlideModel; page: number; total: number }) {
  const { view, toggle } = useView(model);
  return (
    <SlideShell title="Complaints by type" topBar={toggle} page={page} total={total}>
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 14 }}>
        <ByType view={view} />
        <Latest view={view} />
      </div>
    </SlideShell>
  );
}

function Shell({ index, accent, children }: { index: number; accent?: string; children: React.ReactNode }) {
  const animate = useAnimate();
  const delay = index * ANIM.cardStagger;
  return (
    <div style={{ background: T.card, borderRadius: 6, boxShadow: T.cardShadow, borderTop: `3px solid ${accent ?? T.heroText}`, padding: "11px 16px", display: "flex", justifyContent: "space-between", ...entry(animate, "deckRiseIn", ANIM.cardIn, delay) }}>
      {children}
    </div>
  );
}

const cap = { fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: T.inbound, textTransform: "uppercase" as const, whiteSpace: "nowrap" as const };

function PctCard({ index, label, level, target, unit, deltaLabel }: { index: number; label: string; level: ComplaintsView["rides"]; target: number; unit: string; deltaLabel: string | null }) {
  const animate = useAnimate();
  const n = useTweenNumber(level.pct ?? 0, ANIM.count, index * ANIM.cardStagger);
  const below = level.pct !== null && level.pct < target;
  const d = level.deltaPts;
  return (
    <Shell index={index}>
      <div>
        <div style={cap}>{label}</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: below ? BELOW : T.heroText, lineHeight: 1.05, marginTop: 5, fontVariantNumeric: "tabular-nums" }}>{level.pct === null ? "n/a" : `${fmtDec(n)}%`}</div>
        <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 4 }}>
          {fmtInt(level.affected)} of {fmtInt(level.total)} {unit} with a complaint
        </div>
        <div style={{ marginTop: 6, minHeight: 19, ...entry(animate, "deckFadeIn", ANIM.badgeIn, ANIM.badgeDelay) }}>
          {d !== null && deltaLabel && (
            <span style={{ display: "inline-flex", gap: 5, padding: "2px 8px", borderRadius: 10, fontSize: 10.5, whiteSpace: "nowrap", ...(Math.abs(d) < 0.05 ? { background: "#E9EFF5", color: "#475569" } : d > 0 ? { background: "#E8F4E1", color: "#3D7F1F" } : { background: "#FBEFE4", color: BELOW }) }}>
              <strong>{Math.abs(d) < 0.05 ? "0,0" : `${d > 0 ? "+" : "-"}${fmtDec(Math.abs(d))}`} pts</strong>
              <span style={{ opacity: 0.85 }}>{deltaLabel}</span>
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <span style={{ fontSize: 11, color: T.textSecondary }}>Target {target}%</span>
        {/* Only the good news gets a label; below target shows in the colour of the figure. */}
        {level.pct !== null && !below && (
          <span style={{ padding: "3px 9px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#E8F4E1", color: "#3D7F1F" }}>Achieved</span>
        )}
      </div>
    </Shell>
  );
}

function CountCard({ index, label, value, sub, badge }: { index: number; label: string; value: number; sub: string; badge?: string | null }) {
  const animate = useAnimate();
  const n = useTweenNumber(value, ANIM.count, index * ANIM.cardStagger);
  return (
    <Shell index={index}>
      <div>
        <div style={cap}>{label}</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: T.heroText, lineHeight: 1.05, marginTop: 5, fontVariantNumeric: "tabular-nums" }}>{fmtInt(n)}</div>
        <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 4, whiteSpace: "nowrap" }}>{sub}</div>
        {badge && (
          <div style={{ marginTop: 6, ...entry(animate, "deckFadeIn", ANIM.badgeIn, ANIM.badgeDelay) }}>
            <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 10, fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap", ...PENDING_BADGE }}>{badge}</span>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {line ? <span style={{ width: 16, borderTop: `2px dashed ${color}` }} /> : <span style={{ width: 11, height: 11, borderRadius: 2, background: color, boxShadow: color === PENDING ? "inset 0 0 0 1px #E9B949" : undefined }} />}
      {label}
    </span>
  );
}

function PerMonth({ model, view }: { model: ComplaintsSlideModel; view: ComplaintsView }) {
  const animate = useAnimate();
  const [hover, setHover] = useState<number | null>(null);
  const bs = view.buckets;
  const n = bs.length;
  const totals = bs.map((b) => b.sales + b.vendor + b.unassessed);
  const top = Math.max(4, ...totals);
  const step = top <= 5 ? 1 : top <= 10 ? 2 : top <= 25 ? 5 : 10;
  const max = Math.ceil((top + 0.5) / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  const PLOT_H = 250;
  const barW = n <= 4 ? 64 : n <= 7 ? 52 : n <= 10 ? 40 : n <= 13 ? 30 : 12;
  const h = (v: number) => (v / max) * PLOT_H;
  const glide = `height ${ANIM.switch}ms ease-out, bottom ${ANIM.switch}ms ease-out`;
  const per = model.period.kind === "week" ? "Per day" : model.period.kind === "month" ? "Per week" : "Per month";
  return (
    <div style={{ flex: 1, minHeight: 0, background: T.card, borderRadius: 6, boxShadow: T.cardShadow, padding: "14px 22px 10px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.textSecondary }}>{per} · complaints that count, rides without complaint below</div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, fontWeight: 500, color: T.heroText }}>
          <Legend color={ORIGIN.sales} label="Sales" />
          <Legend color={ORIGIN.vendor} label="Vendor" />
          <Legend color={ORIGIN.unassessed} label="Not assessed" />
        </div>
      </div>
      <div style={{ display: "flex" }}>
        <div style={{ width: 40, position: "relative", height: PLOT_H }}>
          {ticks.map((t) => (
            <div key={t} style={{ position: "absolute", right: 10, top: PLOT_H - h(t) - 6, fontSize: 10, color: T.axis }}>
              {t}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: PLOT_H }}>
            {ticks.map((t) => (
              <div key={t} style={{ position: "absolute", left: 0, right: 0, top: PLOT_H - h(t), borderTop: `1px dashed ${T.gridline}`, opacity: t === 0 ? 1 : 0.5 }} />
            ))}
          </div>
          <div style={{ position: "relative", height: PLOT_H, display: "flex", justifyContent: "space-around", alignItems: "flex-end" }}>
            {bs.map((b, i) => {
              const delay = i * ANIM.barStagger;
              const parts: [keyof typeof ORIGIN, number][] = [
                ["vendor", b.vendor],
                ["sales", b.sales],
                ["unassessed", b.unassessed],
              ];
              let base = 0;
              return (
                <div key={b.key} style={{ position: "relative", width: barW, height: PLOT_H }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <div style={{ position: "absolute", inset: 0, transformOrigin: "bottom", ...(animate ? { transform: "scaleY(0)", animation: `deckBarGrow ${ANIM.barGrow}ms ${delay}ms ease-out forwards` } : {}) }}>
                    {parts.map(([k, v]) => {
                      const bottom = h(base);
                      base += v;
                      return v > 0 ? <div key={k} style={{ position: "absolute", left: 0, width: barW, bottom, height: h(v), background: ORIGIN[k], borderTop: "1px solid #fff", transition: glide }} /> : null;
                    })}
                  </div>
                  {totals[i]! > 0 && (
                    <div style={{ position: "absolute", bottom: h(totals[i]!) + 4, left: barW / 2 - 20, width: 40, textAlign: "center", fontSize: 11, fontWeight: 700, color: T.heroText, transition: glide, ...entry(animate, "deckFadeIn", ANIM.labelIn, delay + ANIM.barGrow) }}>
                      {totals[i]}
                    </div>
                  )}
                  {hover === i && (
                    <div style={{ position: "absolute", bottom: Math.min(PLOT_H - 80, h(totals[i]!) + 24), left: barW / 2 - 95, width: 190, zIndex: 20, background: "#fff", border: `1px solid ${T.inbound}`, boxShadow: "0 4px 12px rgba(12,58,92,0.15)", padding: "8px 10px", fontSize: 11, color: T.heroText, fontFamily: FONT, pointerEvents: "none" }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{b.label}</div>
                      {[
                        ["Sales", b.sales],
                        ["Vendor", b.vendor],
                        ["Not assessed", b.unassessed],
                      ].map(([l, v]) => (
                        <div key={l as string} style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>{l}</span>
                          <strong>{v}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", marginTop: 8 }}>
            {bs.map((b) => (
              <div key={b.key} style={{ width: Math.max(barW, 60), textAlign: "center", whiteSpace: "nowrap" }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: T.heroText }}>{b.label}</div>
                <div style={{ fontSize: 10.5, marginTop: 2, color: b.ridesPct !== null && b.ridesPct < model.target ? BELOW : T.textSecondary }}>{b.ridesPct === null ? "" : `${fmtDec(b.ridesPct)}%`}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const CATEGORY_LABEL: Record<ComplaintCategory, string> = {
  Damage: "Damage",
  Stowing: "Stowing",
  "Missing or not loaded": "Missing or not loaded",
  "Dangerous goods and labels": "Dangerous goods and labels",
  "Process and documents": "Process and documents",
  Other: "Other",
};

/** One colour per type (as in the Neele-Vat complaint slides). */
const TYPE_COLOR: Record<ComplaintCategory, string> = {
  Damage: "#1C5A7D",
  Stowing: "#E08A1E",
  "Missing or not loaded": "#3E9BC9",
  "Dangerous goods and labels": "#5BA04A",
  "Process and documents": "#A0632E",
  Other: "#8E5BA6",
};

function ByType({ view }: { view: ComplaintsView }) {
  const animate = useAnimate();
  const [hover, setHover] = useState<ComplaintCategory | null>(null);
  const cats = view.categories.filter((c) => c.counted > 0);
  const total = cats.reduce((a, c) => a + c.counted, 0);
  const pallets = cats.reduce((a, c) => a + c.pallets, 0);
  const n = useTweenNumber(total, ANIM.count, 0);
  const R = 88;
  const SW = 34;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div style={{ background: T.card, borderRadius: 6, boxShadow: T.cardShadow, padding: "16px 22px", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 6 }}>Complaints that count, by type</div>
      {total === 0 ? (
        <div style={{ fontSize: 13, color: T.textSecondary }}>No complaints in this period.</div>
      ) : (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "240px 1fr", gap: 16, alignItems: "center" }}>
          <div style={{ position: "relative", width: 240, height: 240 }}>
            <svg width={240} height={240} viewBox="0 0 240 240" style={{ transform: "rotate(-90deg)" }}>
              {cats.map((c, i) => {
                const len = (c.counted / total) * C;
                const off = acc;
                acc += len;
                const dim = hover !== null && hover !== c.category;
                return (
                  <circle
                    key={c.category}
                    cx={120}
                    cy={120}
                    r={R}
                    fill="none"
                    stroke={TYPE_COLOR[c.category]}
                    strokeWidth={hover === c.category ? SW + 6 : SW}
                    strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`}
                    strokeDashoffset={-off}
                    opacity={dim ? 0.35 : 1}
                    style={{ transition: `stroke-dasharray ${ANIM.switch}ms ease-out, stroke-dashoffset ${ANIM.switch}ms ease-out, opacity 150ms, stroke-width 150ms`, ...entry(animate, "deckFadeIn", 300, 150 + i * 90) }}
                    onMouseEnter={() => setHover(c.category)}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ fontSize: 46, fontWeight: 700, color: T.heroText, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{fmtInt(n)}</div>
              <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>complaints</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.bluePrimary, marginTop: 2 }}>{fmtInt(pallets)} pallets</div>
            </div>
          </div>
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "16px 1fr 78px 52px", columnGap: 8, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: T.textSecondary, paddingBottom: 6, borderBottom: `1px solid #EEF2F6` }}>
              <span />
              <span>Type</span>
              <span style={{ textAlign: "right" }}>Complaints</span>
              <span style={{ textAlign: "right" }}>Pallets</span>
            </div>
            {cats.map((c, i) => (
              <div
                key={c.category}
                onMouseEnter={() => setHover(c.category)}
                onMouseLeave={() => setHover(null)}
                style={{ display: "grid", gridTemplateColumns: "16px 1fr 78px 52px", columnGap: 8, alignItems: "center", height: 36, fontSize: 12.5, color: T.heroText, opacity: hover !== null && hover !== c.category ? 0.45 : 1, transition: "opacity 150ms", ...entry(animate, "deckFadeIn", 220, 250 + i * 70) }}
              >
                <span style={{ width: 16, height: 16, borderRadius: 3, background: TYPE_COLOR[c.category] }} />
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.category}</span>
                <strong style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.counted}</strong>
                <strong style={{ textAlign: "right", color: T.bluePrimary, fontVariantNumeric: "tabular-nums" }}>{fmtInt(c.pallets)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const VERDICT_LABEL = { accepted: "Accepted", open: "Not assessed", denied: "Denied" } as const;

function Latest({ view }: { view: ComplaintsView }) {
  const animate = useAnimate();
  const rows = view.latest.slice(0, 11);
  const cols = "46px 74px 1fr 92px";
  return (
    <div style={{ background: T.card, borderRadius: 6, boxShadow: T.cardShadow, padding: "14px 20px", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 8 }}>
        Latest complaints{view.latest.length > rows.length ? ` · ${rows.length} of ${view.latest.length}` : ""}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: cols, columnGap: 10, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.textSecondary, paddingBottom: 4 }}>
        <span>Date</span>
        <span>Principal</span>
        <span>Subject</span>
        <span style={{ textAlign: "right" }}>Status</span>
      </div>
      {rows.map((c, i) => (
        <div
          key={c.klachtnr}
          title={`Complaint ${c.klachtnr}${c.ritNummer ? ` · ride ${c.ritNummer}` : ""}${c.origin ? ` · ${c.origin === "sales" ? "Sales" : "Vendor"}` : ""}`}
          style={{ display: "grid", gridTemplateColumns: cols, columnGap: 10, alignItems: "center", height: 37, borderTop: "1px solid #EEF2F6", fontSize: 11.5, color: T.heroText, ...entry(animate, "deckFadeIn", 220, 200 + i * 50) }}
        >
          <span style={{ fontVariantNumeric: "tabular-nums", color: T.textSecondary }}>{`${c.day.slice(8)}-${c.day.slice(5, 7)}`}</span>
          <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{c.principal ?? ""}</span>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cleanSubject(c.subject)}</span>
          <span style={{ justifySelf: "end", padding: "2px 8px", borderRadius: 10, fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap", ...(c.verdict === "open" ? PENDING_BADGE : { background: c.verdict === "accepted" ? "#FBEFE4" : "#EEF2F6", color: c.verdict === "accepted" ? BELOW : "#475569" }) }}>
            {VERDICT_LABEL[c.verdict]}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The subject without ride and order numbers: those are in the tooltip. */
function cleanSubject(s: string): string {
  const t = s
    .replace(/\b[A-Z]?\d{6,}\b/g, "")
    .replace(/\b(order|rit|dossier)\s*(?=[.,/]|$)/gi, "")
    .replace(/\s+([.,])/g, "$1")
    .replace(/(^|[.,/]\s*)[.,/]+/g, "$1")
    .replace(/[/.,\s]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
