import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the presentation runtime that is embedded in exported HTML decks
// (one self-contained script). Output goes to public/runtime so the app build
// ships it and the app can inline it at export time.
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "public/runtime",
    emptyOutDir: true,
    lib: {
      entry: "src/present/main.tsx",
      formats: ["iife"],
      name: "WurthDeck",
      fileName: () => "present.js",
    },
    minify: true,
  },
});
