/**
 * Deck design tokens: the Neele-Vat slide style of the original Würth module
 * (Lovable), kept 1:1 so the new deck looks the same.
 */
export const T = {
  canvas: "#DDE9F4",
  bluePrimary: "#266B92",
  blueDark: "#1A4D6B",
  blueLight: "#349BD6",
  bluePale: "#E2EBF4",
  inbound: "#1E5478",
  outbound: "#4FA0D4",
  heroText: "#0C3A5C",
  textDark: "#1A1A2E",
  textSecondary: "#64748B",
  axis: "#5C6470",
  gridline: "#A8C0D4",
  borderSubtle: "#CBD5E1",
  card: "#FFFFFF",
  cardShadow: "0 2px 8px rgba(0,0,0,0.04)",
  ok: "#5BB230",
  warn: "#F4A93C",
  bad: "#E05B5B",
} as const;

export const FONT = "Tahoma, 'Segoe UI', Arial, sans-serif";

export const SLIDE_W = 1280;
export const SLIDE_H = 720;
