import { useAssets } from "../assets";
import { entry, useAnimate } from "../anim";
import { BareSlide } from "../SlideShell";
import { FONT, T } from "../tokens";

/** Section divider of the original module: photo strip, large number on blue, section title. */
export function DividerSlide({
  number,
  title,
  subtitle,
  footer,
  page,
  total,
}: {
  number: string;
  title: string;
  subtitle: string;
  footer: string;
  page: number;
  total: number;
}) {
  const a = useAssets();
  const animate = useAnimate();
  return (
    <BareSlide background={T.bluePale}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ height: 90, position: "relative", flexShrink: 0 }}>
          <img src={a.headerStrip} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: T.bluePrimary }} />
        </div>
        <div style={{ flex: 1, display: "flex" }}>
          <div style={{ width: "40%", background: T.bluePrimary, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: FONT, fontSize: 220, fontWeight: 800, color: "#fff", lineHeight: 1, letterSpacing: "-0.04em", ...entry(animate, "deckRiseIn", 600, 100) }}>
              {number}
            </span>
          </div>
          <div style={{ width: "60%", padding: "100px 80px", display: "flex", flexDirection: "column", justifyContent: "center", position: "relative" }}>
            <div style={entry(animate, "deckRiseIn", 500, 300)}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: T.bluePrimary, margin: "0 0 20px" }}>Section {number}</p>
              <h1 style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-0.02em", color: T.textDark, lineHeight: 1.05, margin: "0 0 24px", fontFamily: FONT }}>{title}</h1>
            </div>
            <div style={{ width: 80, height: 3, background: T.bluePrimary, marginBottom: 24, transformOrigin: "left", ...(animate ? { transform: "scaleX(0)", animation: "deckGrowX 500ms 600ms ease-out forwards" } : {}) }} />
            <p style={{ fontSize: 16, color: T.textSecondary, lineHeight: 1.5, margin: 0, ...entry(animate, "deckFadeIn", 400, 800) }}>{subtitle}</p>
            <img src={a.neelevatLogo} alt="Neele-Vat" style={{ position: "absolute", bottom: 50, right: 60, height: 28 }} />
            <div
              style={{
                position: "absolute",
                bottom: 22,
                left: 80,
                right: 60,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: T.textSecondary,
              }}
            >
              <span>{footer}</span>
              <span>
                {page} / {total}
              </span>
            </div>
          </div>
        </div>
      </div>
    </BareSlide>
  );
}
