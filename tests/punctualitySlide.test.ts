import { makePeriod } from "@/core/period";
import { computeReportSet } from "@/core/report/report";
import { punctualitySlide } from "@/core/slides/punctuality";
import { times, unit } from "./fixtures";

// Q2 2026: 20 rides, 19 on time (one a day late); Q1 2026: 10 rides, 8 on time.
const ride = (rit: string, planned: string, out: string) => unit({ uitgaandeRit: rit, uitslag: out, vertrek: planned });
const units = [
  ...times(19, (i) => ride(`A${i}`, "2026-04-15", "2026-04-15")),
  ride("A99", "2026-05-14", "2026-05-15"), // Thursday planned, Friday loaded: one workday late
  ...times(8, (i) => ride(`B${i}`, "2026-02-10", "2026-02-10")),
  ...times(2, (i) => ride(`C${i}`, "2026-02-10", "2026-02-13")),
];

describe("on time slide model", () => {
  const set = computeReportSet(units, makePeriod("quarter", "2026-Q2"), ["previous"]);
  const m = punctualitySlide(set, "loading");

  it("states the percentage against the target, the change in points and the late rides", () => {
    expect(m.pct).toBe(95);
    expect(m.meetsTarget).toBe(true);
    expect(m.headline).toBe("95,0% of outbound rides were fully loaded on the planned day, above the 95% target.");
    expect(m.context).toBe("Up 15,0 points on Q1 2026. 1 ride was late, all by one workday.");
    expect(m.comparisons[0]).toMatchObject({ label: "vs Q1 2026", pct: 80, deltaPts: 15 });
    expect(`${m.headline} ${m.context}`).not.toMatch(/[–—−]/);
  });

  it("gives a value per month and no ghost markers without a matching comparison", () => {
    expect(m.buckets.map((b) => [b.label, b.pct])).toEqual([["Apr", 100], ["May", 0], ["Jun", null]]);
    expect(m.ghost).toEqual({ kind: "previous", label: "Q1 2026" });
  });
});
