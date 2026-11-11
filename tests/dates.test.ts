import { dayKey, parseDateValue, periodEnd, periodLabelEn, shiftPeriod, workdaysInPeriods } from "@/core/dates";

describe("parseDateValue", () => {
  it("parses Excel serials as wall-clock", () => {
    // 46115 = 2026-04-03; .5 = 12:00
    const d = parseDateValue(46115.5)!;
    expect(d.toISOString()).toBe("2026-04-03T12:00:00.000Z");
  });

  it("parses ISO strings with a space and ignores timezone suffixes", () => {
    expect(dayKey(parseDateValue("2026-04-03 23:30")!)).toBe("2026-04-03");
    expect(dayKey(parseDateValue("2026-04-03T23:30:00+02:00")!)).toBe("2026-04-03");
  });

  it("parses Dutch day-first strings", () => {
    expect(dayKey(parseDateValue("03-04-2026")!)).toBe("2026-04-03");
    expect(parseDateValue("3/4/2026 14:05")!.toISOString()).toBe("2026-04-03T14:05:00.000Z");
  });

  it("rejects empty and impossible dates", () => {
    expect(parseDateValue("")).toBeNull();
    expect(parseDateValue(null)).toBeNull();
    expect(parseDateValue("31-02-2026")).toBeNull();
    expect(parseDateValue("geen datum")).toBeNull();
  });
});

describe("period helpers", () => {
  it("month end is 23:59:59.999 on the last day", () => {
    expect(periodEnd("2026-02").toISOString()).toBe("2026-02-28T23:59:59.999Z");
    expect(periodEnd("2024-02").toISOString()).toBe("2024-02-29T23:59:59.999Z");
  });

  it("shifts across years", () => {
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
    expect(shiftPeriod("2025-11", 3)).toBe("2026-02");
  });

  it("counts Monday–Friday workdays, minus holidays", () => {
    expect(workdaysInPeriods(["2026-04"])).toBe(22);
    expect(workdaysInPeriods(["2026-04"], new Set(["2026-04-06", "2026-04-27"]))).toBe(20);
  });

  it("formats English deck labels", () => {
    expect(periodLabelEn("2026-04")).toBe("Apr 26");
  });
});

