import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ASSET_FILES, type DeckAssets } from "../../src/deck/assets";

/** Deck images from public/brand as data: URIs (for standalone HTML from the command line). */
export function loadDeckAssets(): DeckAssets {
  const out = {} as DeckAssets;
  for (const [k, rel] of Object.entries(ASSET_FILES) as [keyof DeckAssets, string][]) {
    const path = fileURLToPath(new URL(`../../public/${rel}`, import.meta.url));
    const mime = rel.endsWith(".png") ? "image/png" : "image/jpeg";
    out[k] = `data:${mime};base64,${readFileSync(path).toString("base64")}`;
  }
  return out;
}
