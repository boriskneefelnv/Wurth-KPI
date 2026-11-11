import { useAssets } from "../assets";
import { entry, useAnimate } from "../anim";
import { BareSlide } from "../SlideShell";
import { FONT, T } from "../tokens";

/** Cover (variant A of the original module): photo, white title block, blue rule, logos and date. */
export function CoverSlide({ eyebrow, title, subline, date }: { eyebrow: string; title: string; subline: string; date: string }) {
  const a = useAssets();
  const animate = useAnimate();
  return (
    <BareSlide>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ height: "58%", overflow: "hidden" }}>
          <img src={a.coverPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...entry(animate, "deckFadeIn", 900, 0) }} />
        </div>
        <div style={{ height: 4, background: T.bluePrimary }} />
        <div style={{ flex: 1, padding: "26px 60px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 104, ...entry(animate, "deckFadeIn", 500, 700) }}>
            <img src={a.neelevatLogo} alt="Neele-Vat" style={{ height: 30, display: "block" }} />
            <span style={{ width: 1, height: 30, background: T.borderSubtle }} />
            <img src={a.wurthLogo} alt="Würth" style={{ height: 26, display: "block" }} />
          </div>
          <div style={{ marginTop: 104, textAlign: "right", ...entry(animate, "deckFadeIn", 500, 800) }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.textSecondary, margin: "0 0 4px" }}>Meeting date</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: T.textDark, margin: 0 }}>{date}</p>
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 200,
          left: 60,
          width: "60%",
          minHeight: 180,
          background: "#fff",
          padding: "32px 44px 36px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
          zIndex: 3,
          ...entry(animate, "deckRiseIn", 600, 250),
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.bluePrimary, margin: "0 0 14px" }}>{eyebrow}</p>
        <h1 style={{ fontFamily: FONT, fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em", color: T.textDark, lineHeight: 1.05, margin: "0 0 14px" }}>{title}</h1>
        <p style={{ fontSize: 13, color: T.textSecondary, margin: 0 }}>{subline}</p>
      </div>
    </BareSlide>
  );
}
