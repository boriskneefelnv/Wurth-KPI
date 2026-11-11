import { useCallback, useEffect, useRef, useState } from "react";
import { DECK_KEYFRAMES, finishAnimations, StaticRenderContext } from "./anim";
import type { SlideDef } from "./deck";
import { FONT, SLIDE_H, SLIDE_W } from "./tokens";

/**
 * Full-screen presentation (after the original Würth presenter). Used both in
 * the app and in the exported HTML file, so both behave exactly the same.
 *
 * No buttons on screen. Keys: → / Space / PageDown next, ← / PageUp previous,
 * Home / End, 1–9 jump, G overview, F full screen on/off, Esc close (in the
 * app; in an exported file Esc only leaves full screen). Clicking the left or right quarter navigates. The
 * cursor hides when the mouse rests.
 */
export function Presentation({
  slides,
  start = 0,
  onClose,
  standalone = false,
}: {
  slides: SlideDef[];
  start?: number;
  /** Called on Esc when not in full screen (the app). */
  onClose?: () => void;
  /** Exported file: show a start screen first, because full screen needs a click. */
  standalone?: boolean;
}) {
  const [idx, setIdx] = useState(Math.min(start, slides.length - 1));
  const [scale, setScale] = useState(1);
  const [cursor, setCursor] = useState(true);
  const [overview, setOverview] = useState(false);
  const [started, setStarted] = useState(!standalone);
  const root = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  /** Set when we leave full screen ourselves (F), so that is not taken as "close". */
  const leavingByToggle = useRef(false);

  useDeckStyles();

  const go = useCallback(
    (i: number) => {
      finishAnimations();
      setIdx(Math.max(0, Math.min(slides.length - 1, i)));
    },
    [slides.length],
  );

  const enterFullscreen = useCallback(() => {
    if (!document.fullscreenElement) root.current?.requestFullscreen?.().catch(() => {});
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) enterFullscreen();
    else {
      leavingByToggle.current = true;
      document.exitFullscreen().catch(() => {});
    }
  }, [enterFullscreen]);

  const begin = useCallback(() => {
    enterFullscreen();
    setStarted(true);
  }, [enterFullscreen]);

  // In full screen the browser itself uses Esc to leave it (the page never sees
  // that key press). In the app, leaving full screen that way closes the presentation.
  useEffect(() => {
    const onFs = () => {
      if (document.fullscreenElement) return;
      if (leavingByToggle.current) leavingByToggle.current = false;
      else onClose?.();
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [onClose]);

  useEffect(() => {
    if (!standalone) enterFullscreen(); // the click on "Presenteren" counts as user gesture
    const fit = () => setScale(Math.min(window.innerWidth / SLIDE_W, window.innerHeight / SLIDE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      if (!standalone && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [standalone, enterFullscreen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started) {
        if (["Enter", " ", "ArrowRight", "f", "F"].includes(e.key)) {
          e.preventDefault();
          begin();
        }
        return;
      }
      if (overview) {
        if (e.key === "Escape" || e.key === "g" || e.key === "G") {
          e.preventDefault();
          setOverview(false);
        }
        return;
      }
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
          e.preventDefault();
          go(idx + 1);
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          go(idx - 1);
          break;
        case "Home":
          e.preventDefault();
          go(0);
          break;
        case "End":
          e.preventDefault();
          go(slides.length - 1);
          break;
        case "g":
        case "G":
          e.preventDefault();
          setOverview(true);
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "Escape":
          // Only reached outside full screen (in full screen the browser handles Esc).
          e.preventDefault();
          onClose?.();
          break;
        default:
          if (/^[1-9]$/.test(e.key)) {
            e.preventDefault();
            go(Number(e.key) - 1);
          }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, overview, started, go, begin, slides.length, onClose, toggleFullscreen]);

  // Hide the cursor when the mouse rests.
  useEffect(() => {
    const bump = () => {
      setCursor(true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setCursor(false), 2500);
    };
    bump();
    window.addEventListener("mousemove", bump);
    return () => {
      window.removeEventListener("mousemove", bump);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  const current = slides[idx]!;
  return (
    <div ref={root} className="presenter" style={{ cursor: cursor || overview || !started ? "default" : "none" }}>
      {started && (
        <>
          <button className="zone left" aria-label="Vorige slide" onClick={() => go(idx - 1)} />
          <button className="zone right" aria-label="Volgende slide" onClick={() => go(idx + 1)} />
        </>
      )}
      <div key={started ? idx : "start"} className="stage" style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})` }}>
        {started ? (
          current.render(idx + 1, slides.length)
        ) : (
          <StaticRenderContext.Provider value={true}>{slides[0]!.render(1, slides.length)}</StaticRenderContext.Provider>
        )}
      </div>
      {!started && (
        <button className="start" onClick={begin}>
          <span className="play" aria-hidden="true" />
          <span>Presentatie starten</span>
          <small>Enter of klik · ← → bladeren · G overzicht · F volledig scherm</small>
        </button>
      )}
      {overview && (
        <div className="overview" onClick={() => setOverview(false)}>
          <div className="overview-grid" onClick={(e) => e.stopPropagation()}>
            {slides.map((s, i) => (
              <button
                key={s.id}
                className={`thumb ${i === idx ? "current" : ""}`}
                onClick={() => {
                  setOverview(false);
                  go(i);
                }}
              >
                <div className="thumb-canvas">
                  <div style={{ transform: "scale(0.2)", transformOrigin: "top left", width: SLIDE_W, height: SLIDE_H }}>
                    <StaticRenderContext.Provider value={true}>{s.render(i + 1, slides.length)}</StaticRenderContext.Provider>
                  </div>
                </div>
                <span>
                  {i + 1}. {s.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Inserts the deck keyframes and presenter styles once per page. */
function useDeckStyles() {
  useEffect(() => {
    if (document.getElementById("deck-styles")) return;
    const el = document.createElement("style");
    el.id = "deck-styles";
    el.textContent = DECK_KEYFRAMES + PRESENTER_CSS;
    document.head.appendChild(el);
  }, []);
}

export const PRESENTER_CSS = `
.presenter{position:fixed;inset:0;z-index:100;background:#000;display:grid;place-items:center;overflow:hidden;font-family:${FONT}}
.presenter .stage{position:relative;z-index:1;transform-origin:center center;animation:deckFadeIn 250ms ease-out}
.presenter .zone{position:absolute;top:0;bottom:0;width:25%;z-index:2;background:transparent;border:0;padding:0;cursor:inherit}
.presenter .zone.left{left:0}
.presenter .zone.right{right:0}
.presenter .start{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
  background:rgba(10,18,26,.55);border:0;color:#fff;font:600 20px ${FONT};cursor:pointer}
.presenter .start .play{width:0;height:0;border-left:34px solid #fff;border-top:21px solid transparent;border-bottom:21px solid transparent;margin-left:8px}
.presenter .start small{font-weight:400;font-size:12px;color:#cfd8e2}
.presenter .overview{position:absolute;inset:0;z-index:4;background:rgba(10,18,26,.92);overflow:auto;padding:48px}
.presenter .overview-grid{display:grid;grid-template-columns:repeat(auto-fill,260px);gap:24px;justify-content:center}
.presenter .thumb{background:none;border:0;padding:0;color:#cfd8e2;font:12px ${FONT};text-align:left;display:flex;flex-direction:column;gap:6px;cursor:pointer}
.presenter .thumb-canvas{width:256px;height:144px;overflow:hidden;outline:2px solid transparent}
.presenter .thumb.current .thumb-canvas,.presenter .thumb:hover .thumb-canvas{outline-color:#4fa0d4}
`;
