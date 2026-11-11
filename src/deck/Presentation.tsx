import { useCallback, useEffect, useRef, useState } from "react";
import { finishAnimations, StaticRenderContext } from "./anim";
import type { SlideDef } from "./deck";
import { SLIDE_H, SLIDE_W } from "./tokens";

/**
 * Full-screen presentation (after the original Würth presenter): the slide is
 * scaled to the screen, keys and click zones navigate, the controls fade out
 * when the mouse rests. Navigation never waits for an animation.
 *
 * Keys: → / Space / PageDown next, ← / PageUp previous, Home / End,
 * 1–9 jump, G overview, F full screen, Esc leave full screen / close.
 */
export function Presentation({ slides, start = 0, onClose }: { slides: SlideDef[]; start?: number; onClose: () => void }) {
  const [idx, setIdx] = useState(Math.min(start, slides.length - 1));
  const [scale, setScale] = useState(1);
  const [chrome, setChrome] = useState(true);
  const [overview, setOverview] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);

  const go = useCallback(
    (i: number) => {
      finishAnimations();
      setIdx(Math.max(0, Math.min(slides.length - 1, i)));
    },
    [slides.length],
  );

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) root.current?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    // Start in full screen (the click on "Presenteren" counts as user gesture).
    root.current?.requestFullscreen?.().catch(() => {});
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    const fit = () => setScale(Math.min(window.innerWidth / SLIDE_W, window.innerHeight / SLIDE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("resize", fit);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
          e.preventDefault();
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else onClose();
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
  }, [idx, overview, go, slides.length, onClose, toggleFullscreen]);

  const bump = useCallback(() => {
    setChrome(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChrome(false), 2500);
  }, []);
  useEffect(() => {
    bump();
    window.addEventListener("mousemove", bump);
    return () => {
      window.removeEventListener("mousemove", bump);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [bump]);

  const current = slides[idx]!;
  return (
    <div ref={root} className="presenter" style={{ cursor: chrome ? "default" : "none" }}>
      <button className="zone left" aria-label="Vorige slide" onClick={() => go(idx - 1)} />
      <button className="zone right" aria-label="Volgende slide" onClick={() => go(idx + 1)} />
      <div key={idx} className="stage" style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})` }}>
        {current.render(idx + 1, slides.length)}
      </div>
      <div className="chrome" style={{ opacity: chrome ? 1 : 0, pointerEvents: chrome ? "auto" : "none" }}>
        <span className="count">
          {idx + 1} / {slides.length}
        </span>
        <button onClick={() => setOverview(true)} title="Overzicht (G)">
          Overzicht
        </button>
        <button onClick={toggleFullscreen} title="Volledig scherm (F)">
          {fullscreen ? "Venster" : "Volledig scherm"}
        </button>
        <button onClick={onClose} title="Sluiten (Esc)">
          Sluiten
        </button>
      </div>
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
