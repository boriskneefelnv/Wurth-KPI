// Runtime of an exported HTML deck: the same Presentation component and slides
// as the app, fed with the report data embedded in the file.
import { createRoot } from "react-dom/client";
import type { ReportSet } from "../core/report/report";
import { AssetsContext, type DeckAssets } from "../deck/assets";
import { buildDeck } from "../deck/deck";
import { FlagsContext, type DeckFlags } from "../deck/flags";
import { FocusContext } from "../deck/focus";
import type { MainPrincipal } from "../core/types";
import { Presentation } from "../deck/Presentation";

export interface EmbeddedDeck {
  set: ReportSet;
  meetingDate: string;
  assets: DeckAssets;
  flags?: DeckFlags;
  focus?: MainPrincipal | null;
}

declare global {
  interface Window {
    __DECK__: EmbeddedDeck;
  }
}

const deck = window.__DECK__;
const slides = buildDeck(deck.set, new Date(`${deck.meetingDate}T12:00:00`), deck.focus ?? null);
createRoot(document.getElementById("root")!).render(
  <AssetsContext.Provider value={deck.assets}>
    <FlagsContext.Provider value={deck.flags ?? {}}>
      <FocusContext.Provider value={deck.focus ?? null}>
        <Presentation slides={slides} standalone />
      </FocusContext.Provider>
    </FlagsContext.Provider>
  </AssetsContext.Provider>,
);
