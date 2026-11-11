/// <reference lib="webworker" />
import { loadExports } from "./load";

self.onmessage = async (e: MessageEvent<{ files: { name: string; data: ArrayBuffer }[] }>) => {
  try {
    const dataset = await loadExports(e.data.files, (msg) => self.postMessage({ type: "progress", msg }));
    self.postMessage({ type: "done", dataset });
  } catch (err) {
    self.postMessage({ type: "error", msg: err instanceof Error ? err.message : String(err) });
  }
};
