/// <reference lib="webworker" />
import { ExportStore } from "./load";

type Msg =
  | { type: "add"; files: { name: string; data: ArrayBuffer }[] }
  | { type: "remove"; name: string }
  | { type: "clear" };

const store = new ExportStore();
const progress = (msg: string) => self.postMessage({ type: "progress", msg });

self.onmessage = async (e: MessageEvent<Msg>) => {
  try {
    const m = e.data;
    if (m.type === "add") await store.add(m.files, progress);
    if (m.type === "remove") store.remove(m.name);
    if (m.type === "clear") store.clear();
    self.postMessage({ type: "done", dataset: store.dataset(progress) });
  } catch (err) {
    self.postMessage({ type: "error", msg: err instanceof Error ? err.message : String(err) });
  }
};
