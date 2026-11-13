import { svgDataUri, type DeckFlags } from "./flags";

// One lazy chunk per flag: the app only fetches the flags a deck uses.
const modules = import.meta.glob<string>("/node_modules/country-flag-icons/string/3x2/[A-Z][A-Z].js", { import: "default" });

/** Flags for these ISO codes as data: URIs (browser, Vite). Unknown codes are skipped. */
export async function loadFlags(codes: string[]): Promise<DeckFlags> {
  const out: DeckFlags = {};
  await Promise.all(
    codes.map(async (code) => {
      const load = modules[`/node_modules/country-flag-icons/string/3x2/${code}.js`];
      if (load) out[code] = svgDataUri(await load());
    }),
  );
  return out;
}
