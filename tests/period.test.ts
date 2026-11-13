import {
  availableComparisons,
  availablePeriods,
  bucketsFor,
  comparisonOptions,
  comparisonPeriod,
  detectCoverage,
  isCovered,
  isoWeek,
  makePeriod,
  periodContaining,
  workdaysInRange,
} from "@/core/period";
import { unit } from "./fixtures";

describe("periods", () => {
  it("builds every report kind from its key", () => {
    expect(makePeriod("week", "2026-W15")).toMatchObject({ from: "2026-04-06", to: "2026-04-12", label: "Week 15 2026" });
    expect(makePeriod("month", "2026-02")).toMatchObject({ from: "2026-02-01", to: "2026-02-28", label: "Feb 2026" });
    expect(makePeriod("quarter", "2026-Q2")).toMatchObject({ from: "2026-04-01", to: "2026-06-30", label: "Q2 2026" });
    expect(makePeriod("half", "2026-H2")).toMatchObject({ from: "2026-07-01", to: "2026-12-31", label: "H2 2026" });
    expect(makePeriod("year", "2026")).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("handles ISO weeks across the year boundary", () => {
    expect(isoWeek("2026-01-01")).toEqual({ year: 2026, week: 1 });
    expect(makePeriod("week", "2026-W01").from).toBe("2025-12-29");
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(periodContaining("week", "2027-01-03").key).toBe("2026-W53");
  });

  it("finds previous and same-period-last-year comparisons", () => {
    const q = makePeriod("quarter", "2026-Q1");
    expect(comparisonPeriod(q, "previous").key).toBe("2025-Q4");
    expect(comparisonPeriod(q, "lastYear").key).toBe("2025-Q1");
    expect(comparisonPeriod(makePeriod("month", "2026-01"), "previous").key).toBe("2025-12");
    expect(comparisonPeriod(makePeriod("week", "2026-W01"), "previous").key).toBe("2025-W52");
    // 2026 has 53 weeks, 2025 only 52
    expect(comparisonPeriod(makePeriod("week", "2026-W53"), "lastYear").key).toBe("2025-W52");
    expect(comparisonPeriod(makePeriod("half", "2026-H1"), "previous").key).toBe("2025-H2");
    expect(comparisonPeriod(makePeriod("year", "2026"), "previous").key).toBe("2025");
  });

  it("splits periods into bars: days, ISO weeks or months", () => {
    expect(bucketsFor(makePeriod("week", "2026-W15")).map((b) => b.label)).toEqual([
      "Mon 06-04", "Tue 07-04", "Wed 08-04", "Thu 09-04", "Fri 10-04", "Sat 11-04", "Sun 12-04",
    ]);
    expect(bucketsFor(makePeriod("month", "2026-04")).map((b) => [b.label, b.from, b.to])).toEqual([
      ["Wk 14", "2026-04-01", "2026-04-05"],
      ["Wk 15", "2026-04-06", "2026-04-12"],
      ["Wk 16", "2026-04-13", "2026-04-19"],
      ["Wk 17", "2026-04-20", "2026-04-26"],
      ["Wk 18", "2026-04-27", "2026-04-30"],
    ]);
    expect(bucketsFor(makePeriod("quarter", "2026-Q2")).map((b) => b.label)).toEqual(["Apr", "May", "Jun"]);
    expect(bucketsFor(makePeriod("year", "2026"))).toHaveLength(12);
  });

  it("counts workdays with optional holidays", () => {
    expect(workdaysInRange(makePeriod("quarter", "2026-Q2"))).toBe(65);
    expect(workdaysInRange(makePeriod("week", "2026-W15"), new Set(["2026-04-06"]))).toBe(4);
  });
});

describe("coverage", () => {
  it("is spanned by outbound scans; old inbound dates of stock do not extend the start", () => {
    const cov = detectCoverage([
      unit({ inslag: "2023-05-01" }), // old stock
      unit({ inslag: "2025-12-15", uitslag: "2026-01-02" }),
      unit({ inslag: "2026-04-30", uitslag: "2026-04-29" }),
    ]);
    expect(cov).toEqual({ from: "2026-01-02", to: "2026-04-30" });
  });

  it("a period is covered when its first and last workday are in range", () => {
    // Q1 2026 starts on Thursday 1 Jan; data from Friday 2 Jan is not enough…
    expect(isCovered(makePeriod("quarter", "2026-Q1"), { from: "2026-01-02", to: "2026-03-31" })).toBe(false);
    // …but May 2026 starts on a Friday and ends on a Sunday: data from Fri 1 to Fri 29 covers it.
    expect(isCovered(makePeriod("month", "2026-05"), { from: "2026-05-01", to: "2026-05-29" })).toBe(true);
    expect(isCovered(makePeriod("month", "2026-05"), null)).toBe(false);
  });

  it("offers only covered periods and comparisons", () => {
    const cov = { from: "2025-04-01", to: "2026-06-30" };
    expect(availablePeriods("quarter", cov).map((p) => p.key)).toEqual(["2026-Q2", "2026-Q1", "2025-Q4", "2025-Q3", "2025-Q2"]);
    expect(availablePeriods("half", cov).map((p) => p.key)).toEqual(["2026-H1", "2025-H2"]);
    expect(availablePeriods("year", cov)).toEqual([]);
    expect(availableComparisons(makePeriod("quarter", "2026-Q2"), cov)).toEqual(["previous", "lastYear"]);
    expect(availableComparisons(makePeriod("quarter", "2025-Q3"), cov)).toEqual(["previous"]);
    expect(availableComparisons(makePeriod("half", "2026-H1"), cov)).toEqual(["previous"]);
    expect(availableComparisons(makePeriod("month", "2025-04"), cov)).toEqual([]);
  });
});

describe("year to date", () => {
  it("runs from 1 January to the end of the month in the key", () => {
    expect(makePeriod("ytd", "2026-09")).toMatchObject({ from: "2026-01-01", to: "2026-09-30", label: "Jan to Sep 2026" });
  });

  it("compares only with the same months last year", () => {
    const p = makePeriod("ytd", "2026-09");
    expect(comparisonOptions("ytd")).toEqual(["lastYear"]);
    expect(comparisonPeriod(p, "lastYear")).toMatchObject({ kind: "ytd", from: "2025-01-01", to: "2025-09-30" });
  });

  it("offers every covered month end from February on, monthly buckets", () => {
    const ps = availablePeriods("ytd", { from: "2025-12-01", to: "2026-09-30" });
    expect(ps.map((p) => p.key)).toEqual(["2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02"]);
    expect(bucketsFor(ps[0]!).map((b) => b.label)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
  });
});
