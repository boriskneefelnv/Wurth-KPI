import { createContext, useContext } from "react";
import type { MainPrincipal } from "../core/types";

/**
 * The entity a deck is made for (null = all principals). With an entity the
 * data is already narrowed to it (core/report/focus.ts); slides use this only
 * for labels and to hide the principal buttons.
 */
export const FocusContext = createContext<MainPrincipal | null>(null);
export const useFocus = () => useContext(FocusContext);
