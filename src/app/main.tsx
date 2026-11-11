import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DECK_KEYFRAMES } from "../deck/anim";
import "./app.css";

const style = document.createElement("style");
style.textContent = DECK_KEYFRAMES;
document.head.appendChild(style);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
