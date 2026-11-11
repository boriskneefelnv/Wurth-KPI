import { PRINCIPAL_COLORS } from "../core/constants";
import { fmtDec, fmtInt, fmtSignedPct } from "../core/slides/format";
import type { VolumePanel, VolumeSlideModel } from "../core/slides/volume";

/**
 * Static HTML rendering of the volume slide in the Neele-Vat house style
 * (as in the Business Update deck), 1280 × 720. Used by the browser app and
 * by the analysis script. Pure string output, no DOM needed.
 */

/** Brand images as URLs (data: URIs for standalone export). Missing ones get a neutral fallback. */
export interface Brand {
  strip?: string;
  logo?: string;
}

/** House style colours (Business Update deck). */
const C = {
  blue: "#266B94",
  dblue: "#1C5C7A",
  navy: "#16222B",
  grey: "#5B6B78",
  lgrey: "#9AA8B3",
  ice: "#EEF4F8",
  ice2: "#C9DBEA",
  hair: "#D7E3ED",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function chart(panel: VolumePanel, model: VolumeSlideModel, color: string): string {
  const W = 556;
  const H = 312;
  const top = 22;
  const base = 266;
  const n = model.buckets.length;
  const max = Math.max(1, ...panel.hus, ...(panel.ghostHus ?? []));
  const slot = W / n;
  const ghost = panel.ghostHus !== null;
  const barW = Math.min(ghost ? 30 : 44, slot * (ghost ? 0.3 : 0.5));
  const y = (v: number) => base - ((base - top) * v) / max;
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<line x1="0" x2="${W}" y1="${base + 0.5}" y2="${base + 0.5}" stroke="${C.hair}"/>`;
  model.buckets.forEach((b, i) => {
    const cx = slot * i + slot / 2;
    const v = panel.hus[i]!;
    const x = ghost ? cx + 2 : cx - barW / 2;
    if (ghost) {
      const g = panel.ghostHus![i]!;
      svg += `<rect x="${cx - barW - 2}" y="${y(g)}" width="${barW}" height="${base - y(g)}" fill="${C.ice2}"/>`;
    }
    svg += `<rect x="${x}" y="${y(v)}" width="${barW}" height="${base - y(v)}" fill="${color}"/>`;
    if (v > 0) svg += `<text x="${x + barW / 2}" y="${y(v) - 7}" class="v">${fmtInt(v)}</text>`;
    svg += `<text x="${cx}" y="${base + 19}" class="x">${esc(b.label)}</text>`;
    svg += `<text x="${cx}" y="${base + 35}" class="r">${fmtInt(panel.rides[i]!)} ${panel.rides[i] === 1 ? "ride" : "rides"}</text>`;
  });
  return svg + `</svg>`;
}

function card(label: string, panel: VolumePanel, model: VolumeSlideModel, color: string, per: string): string {
  const legend = model.ghost
    ? `<div class="legend"><span><i style="background:${color}"></i>${esc(model.period.label)}</span><span><i style="background:${C.ice2}"></i>${esc(model.ghost.label)}</span></div>`
    : "";
  return `<div class="card"><div class="card-head"><div><span class="eyebrow">${label}</span><span class="unit">HUs per ${per}</span></div>${legend}</div>${chart(panel, model, color)}</div>`;
}

function kpi(label: string, value: string, sub: string): string {
  return `<div class="kpi"><div class="eyebrow">${label}</div><div class="val">${value}</div><div class="sub">${sub}</div></div>`;
}

function changes(p: VolumePanel): string {
  if (!p.comparisons.length) return `${fmtInt(p.totalRides)} ${p.totalRides === 1 ? "ride" : "rides"}`;
  return p.comparisons
    .map((c) => (c.husDeltaPct === null ? "" : `<span class="chip">${fmtSignedPct(c.husDeltaPct)}</span>${esc(c.label)}`))
    .filter(Boolean)
    .join(`<span class="gap"></span>`);
}

export function renderVolumeSlide(model: VolumeSlideModel, page: string, brand: Brand = {}, footer = "QBR Würth · Neele-Vat Maasvlakte"): string {
  const color = model.subject === "Total" ? C.blue : PRINCIPAL_COLORS[model.subject];
  const per = model.period.kind === "week" ? "day" : model.period.kind === "month" ? "week" : "month";
  const eyebrow = model.ghost || model.inbound.comparisons.length
    ? `${model.period.label} compared with ${model.inbound.comparisons.map((c) => c.period.label).join(" and ")}`
    : model.period.label;
  const perDay = (p: VolumePanel) => (p.husPerWorkday === null ? "n/a" : fmtInt(p.husPerWorkday));
  const perRide = (p: VolumePanel) => (p.husPerRide === null ? "n/a" : fmtDec(p.husPerRide));
  return `<section class="slide">
  <div class="strip">${brand.strip ? `<img src="${brand.strip}" alt="">` : ""}</div>
  <div class="plate"></div>
  <div class="tab">${esc(model.title)}</div>
  ${brand.logo ? `<img class="logo" src="${brand.logo}" alt="Neele-Vat Maasvlakte">` : `<div class="logo-text">neele-vat maasvlakte</div>`}
  <div class="intro">
    <div class="eyebrow">${esc(eyebrow)}</div>
    <h1>${esc(model.headline)}</h1>
    ${model.subline ? `<p>${esc(model.subline)}</p>` : ""}
  </div>
  <div class="kpis">
    ${kpi("HUs in", fmtInt(model.inbound.totalHus), changes(model.inbound))}
    ${kpi("HUs out", fmtInt(model.outbound.totalHus), changes(model.outbound))}
    ${kpi("Rides in / out", `${fmtInt(model.inbound.totalRides)} / ${fmtInt(model.outbound.totalRides)}`, `${perRide(model.inbound)} / ${perRide(model.outbound)} HUs per ride`)}
    ${kpi("HUs per workday", `${perDay(model.inbound)} / ${perDay(model.outbound)}`, "in / out")}
  </div>
  <div class="charts">
    ${card("Inbound", model.inbound, model, color, per)}
    ${card("Outbound", model.outbound, model, color, per)}
  </div>
  <div class="footer"><span>${esc(footer)}</span><span>${esc(model.period.label)}<span class="pg">${esc(page)}</span></span></div>
</section>`;
}

/** Styles of the slide itself (all selectors scoped under .slide). */
export const SLIDE_CSS = `
.slide,.slide *{margin:0;padding:0;box-sizing:border-box}
.slide{position:relative;width:1280px;height:720px;overflow:hidden;background:#fff;font-family:Tahoma,"Segoe UI",Geneva,Verdana,sans-serif;color:${C.navy}}
.slide .strip{position:absolute;top:0;left:0;width:100%;height:64px;overflow:hidden;background:linear-gradient(100deg,${C.dblue},${C.blue} 55%,#3F9CC9)}
.slide .strip img{width:100%;height:100%;object-fit:cover;display:block}
.slide .plate{position:absolute;top:16px;left:0;width:560px;height:70px;background:#fff}
.slide .tab{position:absolute;top:16px;left:48px;padding:12px 22px 10px 0;font-size:12px;font-weight:bold;color:${C.dblue}}
.slide .tab::after{content:"";position:absolute;left:0;bottom:0;width:100%;height:3px;background:${C.blue}}
.slide .logo{position:absolute;top:84px;right:48px;height:17px;width:auto}
.slide .logo-text{position:absolute;top:80px;right:48px;font-size:19px;font-weight:bold;letter-spacing:-.01em;color:${C.blue}}
.slide .eyebrow{font-size:10.5px;font-weight:bold;color:${C.blue};letter-spacing:.24em;text-transform:uppercase}
.slide .intro{position:absolute;top:102px;left:48px;width:860px}
.slide .intro h1{margin-top:8px;font-size:25px;font-weight:bold;line-height:1.2;letter-spacing:-.005em;color:${C.navy}}
.slide .intro p{margin-top:7px;font-size:13px;line-height:1.5;color:${C.grey}}
.slide .kpis{position:absolute;top:216px;left:48px;right:48px;display:grid;grid-template-columns:repeat(4,1fr)}
.slide .kpi{padding:0 20px;border-left:1px solid ${C.hair}}
.slide .kpi:first-child{padding-left:0;border-left:0}
.slide .val{margin-top:6px;font-size:23px;font-weight:bold;line-height:1.1;color:${C.navy};font-variant-numeric:tabular-nums}
.slide .sub{margin-top:6px;font-size:11px;color:${C.lgrey};display:flex;align-items:center;white-space:nowrap}
.slide .chip{display:inline-block;margin-right:6px;padding:2px 6px 1px;border-radius:3px;background:${C.ice};color:${C.dblue};font-size:10.5px;font-weight:bold}
.slide .gap{display:inline-block;width:12px}
.slide .charts{position:absolute;top:300px;left:48px;right:48px;bottom:58px;display:grid;grid-template-columns:1fr 1fr;gap:20px}
.slide .card{border:1px solid ${C.hair};border-top:3px solid ${C.blue};border-radius:4px;padding:14px 18px 0;background:#fff;overflow:hidden}
.slide .card-head{display:flex;justify-content:space-between;align-items:baseline;height:22px}
.slide .unit{margin-left:10px;font-size:11px;color:${C.lgrey}}
.slide .legend{display:flex;gap:14px;font-size:11px;color:${C.grey}}
.slide .legend i{display:inline-block;width:8px;height:8px;margin-right:6px;vertical-align:0}
.slide svg text{font-family:Tahoma,"Segoe UI",Geneva,Verdana,sans-serif;text-anchor:middle}
.slide .v{font-size:11.5px;font-weight:bold;fill:${C.navy}}
.slide .x{font-size:11.5px;fill:${C.grey}}
.slide .r{font-size:10.5px;fill:${C.lgrey}}
.slide .footer{position:absolute;bottom:22px;left:48px;right:48px;display:flex;justify-content:space-between;font-size:10px;font-weight:bold;letter-spacing:.18em;text-transform:uppercase;color:${C.lgrey}}
.slide .pg{margin-left:18px}
`;

/** Page around the slides for a standalone HTML file; prints one slide per landscape page. */
export const PAGE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{background:#5a646c;padding:24px;display:flex;flex-direction:column;gap:24px;align-items:center}
@page{size:1280px 720px;margin:0}
@media print{body{background:none;padding:0;gap:0;display:block}.slide{break-after:page}}
`;

export function volumeDocument(slides: string[], title = "Volume"): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${PAGE_CSS}${SLIDE_CSS}</style><body>${slides.join("\n")}</body></html>`;
}
