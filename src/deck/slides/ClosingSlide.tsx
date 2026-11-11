import { useAssets } from "../assets";
import { entry, useAnimate } from "../anim";
import { BareSlide } from "../SlideShell";
import { FONT, T } from "../tokens";

/** Closing slide (variant A of the original module). */
export function ClosingSlide({ footer }: { footer: string }) {
  const a = useAssets();
  const animate = useAnimate();
  return (
    <BareSlide>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ height: "50%", overflow: "hidden" }}>
          <img src={a.coverPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div style={{ height: 4, background: T.bluePrimary }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", paddingBottom: 60 }}>
          <h1 style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-0.02em", color: T.textDark, margin: "0 0 22px", fontFamily: FONT, ...entry(animate, "deckRiseIn", 600, 150) }}>
            Logistics in trusted hands.
          </h1>
          <p style={{ fontSize: 18, color: T.bluePrimary, margin: "0 0 14px", ...entry(animate, "deckFadeIn", 400, 600) }}>Thank you.</p>
          <div style={{ width: 80, height: 2, background: T.bluePrimary, margin: "0 auto 26px" }} />
          <img src={a.neelevatLogo} alt="Neele-Vat" style={{ height: 36 }} />
        </div>
        <p style={{ position: "absolute", bottom: 22, left: 0, right: 0, textAlign: "center", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: T.textSecondary, margin: 0 }}>
          {footer}
        </p>
      </div>
    </BareSlide>
  );
}
