import { easterSunday, warehouseHolidays } from "@/core/holidays";

describe("warehouse holidays", () => {
  it("computes Easter", () => {
    expect([2024, 2025, 2026, 2027].map(easterSunday)).toEqual(["2024-03-31", "2025-04-20", "2026-04-05", "2027-03-28"]);
  });

  it("matches the days the warehouse was closed in 2025 and 2026", () => {
    expect(warehouseHolidays(2025).map((h) => h.day)).toEqual([
      "2025-01-01", "2025-04-21", "2025-04-26", "2025-05-05", "2025-05-29", "2025-06-09", "2025-12-25", "2025-12-26",
    ]);
    // 2026: no Liberation Day (only lustrum years); Good Friday is a working day
    expect(warehouseHolidays(2026).map((h) => h.day)).toEqual([
      "2026-01-01", "2026-04-06", "2026-04-27", "2026-05-14", "2026-05-25", "2026-12-25", "2026-12-26",
    ]);
  });
});
