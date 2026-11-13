// Animation system of the deck, ported from the original Würth module.
//
// Ease-out cubic; bars grow 500 ms with 60 ms stagger per period; labels fade
// 200 ms after; numbers count up in ~800 ms. No animation library.
// The final state is always what a static render shows (exports, print,
// thumbnails): animations only run in the live presentation.

import { createContext, useContext, useEffect, useRef, useState } from "react";

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const ANIM = {
  cardIn: 320,
  cardStagger: 80,
  count: 800,
  badgeDelay: 820,
  badgeIn: 220,
  barGrow: 500,
  barStagger: 60,
  labelIn: 200,
  labelDelay: 300,
  markerDelay: 650,
  /** Switching a view on a slide (bars and numbers glide to the new values). */
  switch: 450,
} as const;

/** True: everything renders in its final state (export, print, thumbnails). */
export const StaticRenderContext = createContext(false);
export const useStaticRender = () => useContext(StaticRenderContext);

const finishers = new Set<() => void>();

export function registerAnimFinisher(fn: () => void): () => void {
  finishers.add(fn);
  return () => {
    finishers.delete(fn);
  };
}

/** Put every running animation in its final state (navigation never waits). */
export function finishAnimations() {
  for (const fn of Array.from(finishers)) fn();
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}

/** True when CSS entry animations should run. */
export function useAnimate(): boolean {
  const staticRender = useStaticRender();
  return !staticRender && !prefersReducedMotion();
}

/**
 * Counts up from 0 to `value` on mount. The initial state is the final value,
 * so static renders and server renders always show the real number.
 */
export function useTweenNumber(value: number, duration: number = ANIM.count, delay = 0): number {
  const animate = useAnimate();
  const [n, setN] = useState(value);
  const started = useRef(false);
  const shown = useRef(value);
  shown.current = n;
  useEffect(() => {
    if (!animate) {
      setN(value);
      return;
    }
    // First time: count up from 0. Later changes (a view switched on the
    // slide): glide from the number on screen to the new one.
    const first = !started.current;
    started.current = true;
    const from = first ? 0 : shown.current;
    const dur = first ? duration : ANIM.switch;
    const wait = first ? delay : 0;
    if (from === value) return;
    let raf = 0;
    let stopped = false;
    const finish = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      setN(value);
    };
    const unregister = registerAnimFinisher(finish);
    const start = performance.now() + wait;
    setN(from);
    const tick = (now: number) => {
      if (stopped) return;
      const k = Math.max(0, Math.min(1, (now - start) / dur));
      setN(from + (value - from) * easeOutCubic(k));
      if (k < 1) raf = requestAnimationFrame(tick);
      else setN(value);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      unregister();
    };
  }, [value, duration, delay, animate]);
  return n;
}

/** Keyframes used by the slides (inserted once per page / export). */
export const DECK_KEYFRAMES = `
@keyframes deckBarGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes deckFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes deckRiseIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes deckGrowX { from { transform: scaleX(0); } to { transform: scaleX(1); } }
`;

/** Inline style for an entry animation, or nothing when rendering statically. */
export function entry(animate: boolean, name: string, durationMs: number, delayMs: number, extra: React.CSSProperties = {}): React.CSSProperties {
  if (!animate) return {};
  return { opacity: 0, animation: `${name} ${durationMs}ms ${delayMs}ms ease-out forwards`, ...extra };
}
