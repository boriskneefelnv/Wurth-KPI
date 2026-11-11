import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SLIDE_CSS } from "../slides/renderVolume";
import "./app.css";

const style = document.createElement("style");
style.textContent = SLIDE_CSS;
document.head.appendChild(style);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
