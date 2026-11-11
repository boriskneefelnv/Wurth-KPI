import type { ReactNode } from "react";
import { useAssets } from "./assets";
import { FONT, SLIDE_H, SLIDE_W, T } from "./tokens";

/**
 * 1280 × 720 slide in the Neele-Vat template (as in the original Würth module):
 * pale blue canvas, container photo strip with a blue rule, white title block
 * with a large blue title, Neele-Vat logo top right, page counter bottom right.
 */
export function SlideShell({
  title,
  subtitle,
  page,
  total,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  page: number;
  total: number;
  children: ReactNode;
}) {
  const a = useAssets();
  return (
    <div
      data-slide
      style={{ position: "relative", width: SLIDE_W, height: SLIDE_H, overflow: "hidden", background: T.canvas, fontFamily: FONT, color: T.textDark }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 92 }}>
        <img src={a.headerStrip} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: T.bluePrimary }} />
      </div>
      <div style={{ position: "absolute", top: 22, left: 48, background: "#fff", padding: "16px 28px", minWidth: 520, maxWidth: "70%", zIndex: 2 }}>
        <h1 style={{ margin: 0, color: T.bluePrimary, fontSize: 30, fontWeight: 400, lineHeight: 1.1, letterSpacing: "-0.005em", fontFamily: FONT }}>
          {title}
        </h1>
      </div>
      <img src={a.neelevatLogo} alt="Neele-Vat" style={{ position: "absolute", top: 112, right: 48, height: 22, width: "auto", zIndex: 3 }} />
      <div style={{ position: "absolute", top: 118, left: 48, right: 48, bottom: 48, display: "flex", flexDirection: "column" }}>
        {subtitle && (
          <div style={{ fontSize: 13, color: T.textSecondary, marginTop: -4, marginBottom: 16, maxWidth: 1000, lineHeight: 1.45 }}>{subtitle}</div>
        )}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 48,
          right: 48,
          display: "flex",
          justifyContent: "flex-end",
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.1em",
          color: T.textSecondary,
        }}
      >
        {page} / {total}
      </div>
    </div>
  );
}

/** A slide without the standard chrome (cover, divider, closing). */
export function BareSlide({ background = "#fff", children }: { background?: string; children: ReactNode }) {
  return (
    <div data-slide style={{ position: "relative", width: SLIDE_W, height: SLIDE_H, overflow: "hidden", background, fontFamily: FONT, color: T.textDark }}>
      {children}
    </div>
  );
}
