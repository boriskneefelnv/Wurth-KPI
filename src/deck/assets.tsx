import { createContext, useContext } from "react";

/** Brand images used by the slides. In the app these are URLs, in an export data: URIs. */
export interface DeckAssets {
  headerStrip: string;
  neelevatLogo: string;
  wurthLogo: string;
  coverPhoto: string;
}

export const ASSET_FILES: Record<keyof DeckAssets, string> = {
  headerStrip: "brand/header-strip.jpg",
  neelevatLogo: "brand/neelevat-logo.png",
  wurthLogo: "brand/wurth-logo.png",
  coverPhoto: "brand/cover-containers.jpg",
};

/** Asset URLs relative to the site root (works under any path). */
export function assetUrls(base = "./"): DeckAssets {
  const out = {} as DeckAssets;
  for (const [k, v] of Object.entries(ASSET_FILES)) out[k as keyof DeckAssets] = `${base}${v}`;
  return out;
}

export const AssetsContext = createContext<DeckAssets>(assetUrls());
export const useAssets = () => useContext(AssetsContext);
