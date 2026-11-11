import { renderToStaticMarkup } from "react-dom/server";
import { AssetsContext, type DeckAssets } from "./assets";
import { DECK_KEYFRAMES, StaticRenderContext } from "./anim";
import type { SlideDef } from "./deck";
import { SLIDE_H, SLIDE_W } from "./tokens";

/** Static markup of every slide (final state, no animations). */
export function renderSlidesStatic(slides: SlideDef[], assets: DeckAssets): string[] {
  return slides.map((s, i) =>
    renderToStaticMarkup(
      <StaticRenderContext.Provider value={true}>
        <AssetsContext.Provider value={assets}>{s.render(i + 1, slides.length)}</AssetsContext.Provider>
      </StaticRenderContext.Provider>,
    ),
  );
}

/**
 * Standalone HTML deck. Opens as a presentation (one slide, scaled to the
 * window; arrows, space, click, F for full screen) and prints one slide per
 * landscape page. Images must be data: URIs for the file to work on its own.
 */
export function deckDocument(slidesHtml: string[], title: string): string {
  const sections = slidesHtml.map((h, i) => `<section class="s${i === 0 ? " on" : ""}">${h}</section>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#000;overflow:hidden}
.s{position:fixed;left:50%;top:50%;width:${SLIDE_W}px;height:${SLIDE_H}px;margin:-${SLIDE_H / 2}px 0 0 -${SLIDE_W / 2}px;display:none}
.s.on{display:block;animation:deckFadeIn 250ms ease-out}
.hint{position:fixed;left:50%;top:14px;transform:translateX(-50%);padding:6px 12px;border-radius:12px;background:rgba(10,18,26,.75);font:12px Tahoma,Arial,sans-serif;color:#e4edf5;opacity:1;transition:opacity .6s;pointer-events:none}
${DECK_KEYFRAMES}
@page{size:${SLIDE_W}px ${SLIDE_H}px;margin:0}
@media print{
  html,body{background:none;overflow:visible;height:auto}
  .s{position:static;display:block !important;margin:0;transform:none !important;break-after:page;animation:none}
  .hint{display:none}
}
</style>
</head>
<body>
${sections}
<div class="hint">← → bladeren · F volledig scherm · Ctrl+P afdrukken</div>
<script>
(function(){
  var s=[].slice.call(document.querySelectorAll('.s')),i=0,hint=document.querySelector('.hint');
  function fit(){var k=Math.min(innerWidth/${SLIDE_W},innerHeight/${SLIDE_H});s.forEach(function(x){x.style.transform='scale('+k+')'});}
  function show(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach(function(x,j){x.classList.toggle('on',j===i)});}
  addEventListener('resize',fit);fit();
  addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();show(i+1)}
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();show(i-1)}
    else if(e.key==='Home'){show(0)}else if(e.key==='End'){show(s.length-1)}
    else if(e.key==='f'||e.key==='F'){if(!document.fullscreenElement)document.documentElement.requestFullscreen();else document.exitFullscreen()}
    else if(/^[1-9]$/.test(e.key)){show(+e.key-1)}
  });
  addEventListener('click',function(e){show(e.clientX<innerWidth/3?i-1:i+1)});
  setTimeout(function(){hint.style.opacity=0},3000);
})();
</script>
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
