import { lastScanDay } from "@/core/wms/exportRange";
import { unit } from "./fixtures";

describe("last scan day", () => {
  it("is the latest inbound or outbound scan", () => {
    expect(lastScanDay([unit({ inslag: "2026-11-10", uitslag: "2026-11-11" }), unit({ inslag: "2026-10-01" })])).toBe("2026-11-11");
  });
});
