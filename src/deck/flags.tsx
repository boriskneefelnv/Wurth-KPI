import { createContext, useContext } from "react";
import type { ReportSet } from "../core/report/report";

/**
 * Country flags as data: URIs, keyed by ISO code. Only the flags a deck needs
 * are loaded (app) or embedded (HTML export), so the export stays small and
 * works offline.
 */
export type DeckFlags = Record<string, string>;

export const FlagsContext = createContext<DeckFlags>({});
export const useFlags = () => useContext(FlagsContext);

export const svgDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Every destination country in the report set (current period and comparisons). */
export function flagCodes(set: ReportSet): string[] {
  const codes = new Set<string>();
  for (const r of [set.current, ...set.comparisons.map((c) => c.report)]) {
    for (const c of r.outboundCountries) codes.add(c.country);
    for (const c of r.storageDestinations.Total) codes.add(c.country);
  }
  return [...codes].filter((c) => /^[A-Z]{2}$/.test(c)).sort();
}

/** A small 3:2 flag; a quiet grey tile with the code when the flag is missing. */
export function Flag({ code, height = 14 }: { code: string; height?: number }) {
  const src = useFlags()[code];
  const width = Math.round((height * 3) / 2);
  const box = { width, height, borderRadius: 2, flex: "none" as const, boxShadow: "0 0 0 1px rgba(12,58,92,0.12)" };
  if (src) return <img src={src} alt="" style={{ ...box, display: "block", objectFit: "cover" }} />;
  return (
    <span style={{ ...box, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#E9EFF5", color: "#64748B", fontSize: height * 0.5, fontWeight: 700 }}>
      {code.slice(0, 2)}
    </span>
  );
}
