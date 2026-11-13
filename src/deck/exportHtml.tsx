import { renderToStaticMarkup } from "react-dom/server";
import { AssetsContext, type DeckAssets } from "./assets";
import type { ReportSet } from "../core/report/report";
import { StaticRenderContext } from "./anim";
import type { SlideDef } from "./deck";
import { FlagsContext, type DeckFlags } from "./flags";
import { FocusContext } from "./focus";
import type { MainPrincipal } from "../core/types";
import { SLIDE_H, SLIDE_W } from "./tokens";

/** Static markup of every slide (final state, no animations). */
export function renderSlidesStatic(slides: SlideDef[], assets: DeckAssets, flags: DeckFlags = {}, focus: MainPrincipal | null = null): string[] {
  return slides.map((s, i) =>
    renderToStaticMarkup(
      <StaticRenderContext.Provider value={true}>
        <AssetsContext.Provider value={assets}>
          <FlagsContext.Provider value={flags}>
            <FocusContext.Provider value={focus}>{s.render(i + 1, slides.length)}</FocusContext.Provider>
          </FlagsContext.Provider>
        </AssetsContext.Provider>
      </StaticRenderContext.Provider>,
    ),
  );
}

/** Data embedded in an exported deck (read by src/present/main.tsx). */
export interface EmbeddedDeckData {
  set: ReportSet;
  meetingDate: string;
  assets: DeckAssets;
  flags?: DeckFlags;
  focus?: MainPrincipal | null;
}

const scriptSafe = (s: string) => s.replace(/<\/(script)/gi, "<\\/$1");

/**
 * Standalone HTML deck with exactly the presentation of the app: the same
 * React component and slides (the presentation runtime), the report data and
 * images embedded. Printing gives one static slide per landscape page.
 */
export function interactiveDeckDocument(opts: { runtime: string; data: EmbeddedDeckData; printSlides: string[]; title: string }): string {
  const json = JSON.stringify(opts.data).replace(/</g, "\\u003c");
  const print = opts.printSlides.map((h) => `<section class="p">${h}</section>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${opts.title.replace(/</g, "&lt;")}</title>
<style>
html,body{margin:0;height:100%;background:#000;overflow:hidden}
.print{display:none}
@page{size:${SLIDE_W}px ${SLIDE_H}px;margin:0}
@media print{
  html,body{background:none;overflow:visible;height:auto}
  #root{display:none}
  .print{display:block}
  .p{width:${SLIDE_W}px;height:${SLIDE_H}px;overflow:hidden;break-after:page}
}
</style>
</head>
<body>
<div id="root"></div>
<div class="print">${print}</div>
<script>window.__DECK__=${json};</script>
<script>${scriptSafe(opts.runtime)}</script>
</body>
</html>`;
}

/** Convert asset URLs to data: URIs (browser). */
export async function inlineAssets(urls: DeckAssets): Promise<DeckAssets> {
  const out = {} as DeckAssets;
  for (const [k, url] of Object.entries(urls) as [keyof DeckAssets, string][]) {
    const blob = await (await fetch(url)).blob();
    out[k] = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  return out;
}
