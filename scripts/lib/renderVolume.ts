import { PRINCIPAL_COLORS, TOKENS } from "../../src/core/constants";
import type { VolumePanel, VolumeSlideModel } from "../../src/core/slides/volume";

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const fmt = (x: number) => Math.round(x).toLocaleString("en-GB");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function delta(x: number | null): string {
  if (x === null) return `<span class="d">n/a</span>`;
  const arrow = x >= 0 ? "▲" : "▼";
  return `<span class="d">${arrow} ${Math.abs(Math.round(x))}%</span>`;
}

function chart(panel: VolumePanel, model: VolumeSlideModel, color: string): string {
  const W = 548;
  const H = 300;
  const top = 26;
  const base = 246;
  const max = Math.max(1, ...panel.hus, ...(panel.ghostHus ?? []));
  const n = model.buckets.length;
  const slot = W / n;
  const ghost = panel.ghostHus !== null;
  const barW = Math.min(ghost ? 44 : 64, slot * 0.36);
  const y = (v: number) => base - ((base - top) * v) / max;
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="${TOKENS.borderSubtle}"/>`;
  model.buckets.forEach((b, i) => {
    const cx = slot * i + slot / 2;
    const v = panel.hus[i]!;
    const curX = ghost ? cx + 2 : cx - barW / 2;
    if (ghost) {
      const g = panel.ghostHus![i]!;
      svg += `<rect x="${cx - barW - 2}" y="${y(g)}" width="${barW}" height="${base - y(g)}" fill="${TOKENS.borderSubtle}" rx="2"/>`;
      svg += `<text x="${cx - barW / 2 - 2}" y="${y(g) - 6}" class="gv">${fmt(g)}</text>`;
    }
    svg += `<rect x="${curX}" y="${y(v)}" width="${barW}" height="${base - y(v)}" fill="${color}" rx="2"/>`;
    svg += `<text x="${curX + barW / 2}" y="${y(v) - 6}" class="bv">${fmt(v)}</text>`;
    svg += `<text x="${cx}" y="${base + 20}" class="bl">${esc(b.label)}</text>`;
    svg += `<text x="${cx}" y="${base + 40}" class="br">${fmt(panel.rides[i]!)} ${panel.rides[i] === 1 ? "ride" : "rides"}</text>`;
  });
  return svg + `</svg>`;
}

function card(title: string, panel: VolumePanel, model: VolumeSlideModel, color: string): string {
  const legend = model.ghost
    ? `<div class="legend"><i style="background:${color}"></i>${esc(model.period.label)}<i style="background:${TOKENS.borderSubtle}"></i>${esc(model.ghost.label)}</div>`
    : "";
  return `<div class="card"><div class="caps">${title}</div>${legend}${chart(panel, model, color)}</div>`;
}

function kpi(label: string, panel: VolumePanel): string {
  const cmp = panel.comparisons.map((c) => `<div class="cmp">${delta(c.husDeltaPct)} <span>${esc(c.label)}</span></div>`).join("");
  return `<div class="kpi"><div class="caps">${label}</div><div class="big">${fmt(panel.totalHus)} <small>HUs</small></div>${cmp}</div>`;
}

export function renderVolumeSlide(model: VolumeSlideModel, page: string): string {
  const color = model.subject === "Total" ? TOKENS.bluePrimary : PRINCIPAL_COLORS[model.subject];
  const perDay = (p: VolumePanel) => (p.husPerWorkday === null ? "—" : fmt(p.husPerWorkday));
  const per = model.period.kind === "week" ? "day" : model.period.kind === "month" ? "week" : "month";
  const perRide = (p: VolumePanel) => (p.husPerRide === null ? "—" : p.husPerRide.toFixed(1));
  return `<div class="slide">
  <div class="header"></div>
  <div class="title">${esc(model.title)}</div>
  <div class="logo">NEELE-VAT</div>
  <div class="content">
    <div class="period caps">${esc(model.period.label)}</div>
    <div class="row">
      ${card(`Inbound · HUs per ${per}`, model.inbound, model, color)}
      ${card(`Outbound · HUs per ${per}`, model.outbound, model, color)}
    </div>
    <div class="strip">
      ${kpi("HUs in", model.inbound)}
      ${kpi("HUs out", model.outbound)}
      <div class="kpi"><div class="caps">Rides in / out</div><div class="big">${fmt(model.inbound.totalRides)} / ${fmt(model.outbound.totalRides)}</div>
        <div class="cmp"><span>${perRide(model.inbound)} / ${perRide(model.outbound)} HUs per ride</span></div></div>
      <div class="kpi"><div class="caps">HUs per workday</div><div class="big">${perDay(model.inbound)} / ${perDay(model.outbound)}</div>
        <div class="cmp"><span>in / out</span></div></div>
    </div>
    <div class="insight">${model.insights.map((t) => `<div>▸ ${esc(t)}</div>`).join("")}</div>
  </div>
  <div class="footer">${page}</div>
</div>`;
}

export const VOLUME_CSS = `
*{box-sizing:border-box;margin:0}
body{background:#888;font-family:Tahoma,'Segoe UI',Arial,sans-serif;color:${TOKENS.textDark};padding:24px;display:flex;flex-direction:column;gap:24px;align-items:center}
.slide{position:relative;width:1280px;height:720px;overflow:hidden;background:${TOKENS.canvas}}
.header{position:absolute;top:0;left:0;right:0;height:92px;background:linear-gradient(100deg,${TOKENS.blueDark},${TOKENS.bluePrimary} 60%,${TOKENS.blueLight});border-bottom:3px solid ${TOKENS.bluePrimary}}
.title{position:absolute;top:22px;left:48px;background:#fff;padding:16px 28px;min-width:520px;font-size:30px;font-weight:400;line-height:1.1}
.logo{position:absolute;top:112px;right:48px;height:22px;font-weight:700;letter-spacing:.08em;color:${TOKENS.bluePrimary};font-size:16px}
.content{position:absolute;top:118px;left:48px;right:48px;bottom:48px;display:flex;flex-direction:column;gap:12px}
.caps{text-transform:uppercase;letter-spacing:.1em;font-size:11px;font-weight:700;color:${TOKENS.bluePrimary}}
.period{margin-bottom:-4px}
.row{display:flex;gap:16px}
.card{flex:1;background:#fff;border-radius:6px;padding:14px 16px 6px;position:relative}
.legend{position:absolute;top:12px;right:16px;font-size:11px;color:${TOKENS.textSecondary};display:flex;align-items:center;gap:6px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-left:8px}
svg text{font-family:inherit;text-anchor:middle}
.bv{font-size:13px;font-weight:700;fill:${TOKENS.textDark}}
.gv{font-size:11px;fill:${TOKENS.textSecondary}}
.bl{font-size:13px;fill:${TOKENS.textDark}}
.br{font-size:11px;fill:${TOKENS.textSecondary}}
.strip{display:flex;gap:16px}
.kpi{flex:1;background:#fff;border-radius:6px;padding:10px 16px}
.big{font-size:26px;margin:2px 0}
.big small{font-size:13px;color:${TOKENS.textSecondary}}
.cmp{font-size:12px;color:${TOKENS.textSecondary}}
.d{font-weight:700;color:${TOKENS.textDark};margin-right:2px}
.insight{font-size:14px;line-height:1.45;color:${TOKENS.textDark}}
.footer{position:absolute;bottom:14px;right:48px;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.1em;color:${TOKENS.textSecondary}}
`;


export function volumeDocument(slides: string[], title = "Volume"): string {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><style>${VOLUME_CSS}</style>${slides.join("\n")}`;
}
