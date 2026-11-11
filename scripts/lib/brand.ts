import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Brand } from "../../src/slides/renderVolume";

/** Brand images from assets/brand (not in git); missing files give the fallback look. */
export function loadBrand(): Brand {
  const file = (name: string, mime: string) => {
    const p = fileURLToPath(new URL(`../../assets/brand/${name}`, import.meta.url));
    return existsSync(p) ? `data:${mime};base64,${readFileSync(p).toString("base64")}` : undefined;
  };
  return { strip: file("strip.jpg", "image/jpeg"), logo: file("maasvlakte-blue.png", "image/png") };
}
