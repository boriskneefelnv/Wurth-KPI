import { exportRequirements, fileSpan, missingSpans } from "@/core/wms/requirements";

describe("export requirements", () => {
  it("rides for the shown months, units with the margins", () => {
    expect(exportRequirements({ from: "2026-01", to: "2026-06", previous: false, lastYear: false }, "2026-11-11")).toEqual({
      display: { from: "2026-01-01", to: "2026-06-30" },
      rides: { from: "2026-01-01", to: "2026-06-30" },
      units: { from: "2025-09-01", to: "2026-07-30" },
    });
  });

  it("includes the comparison months", () => {
    const q = exportRequirements({ from: "2026-04", to: "2026-06", previous: true, lastYear: true }, "2026-11-11");
    expect(q.rides).toEqual({ from: "2025-04-01", to: "2026-06-30" });
    expect(q.units.from).toBe("2024-12-01");
    const prevOnly = exportRequirements({ from: "2026-04", to: "2026-06", previous: true, lastYear: false }, "2026-11-11");
    expect(prevOnly.rides.from).toBe("2026-01-01");
  });

  it("never asks for data after today", () => {
    const r = exportRequirements({ from: "2026-10", to: "2026-12", previous: false, lastYear: false }, "2026-11-11");
    expect(r.rides.to).toBe("2026-11-11");
    expect(r.units.to).toBe("2026-11-11");
  });
});

describe("missing spans", () => {
  const req = { from: "2025-09-01", to: "2026-07-30" };

  it("everything covered, small gaps at the edges ignored", () => {
    expect(missingSpans(req, [{ from: "2025-09-02", to: "2026-07-28", capped: false }])).toEqual([]);
  });

  it("reports what is missing at the start and the end", () => {
    expect(missingSpans(req, [{ from: "2026-01-05", to: "2026-06-30", capped: false }])).toEqual([
      { from: "2025-09-01", to: "2026-01-04" },
      { from: "2026-07-01", to: "2026-07-30" },
    ]);
  });

  it("a capped file is missing from its (incomplete) last day", () => {
    expect(missingSpans(req, [{ from: "2025-09-01", to: "2026-03-25", capped: true }])).toEqual([{ from: "2026-03-25", to: "2026-07-30" }]);
  });

  it("combines files and finds a hole between them", () => {
    expect(
      missingSpans(req, [
        { from: "2025-09-01", to: "2025-12-31", capped: false },
        { from: "2026-03-01", to: "2026-07-30", capped: false },
      ]),
    ).toEqual([{ from: "2026-01-01", to: "2026-02-28" }]);
    expect(
      missingSpans(req, [
        { from: "2025-09-01", to: "2026-03-25", capped: true },
        { from: "2025-10-01", to: "2026-07-30", capped: false },
      ]),
    ).toEqual([]);
  });

  it("ignores stray dates far from the rest, but keeps quiet real days", () => {
    const days = Array.from({ length: 120 }, (_, i) => new Date(Date.UTC(2025, 8, 1 + i)).toISOString().slice(0, 10)); // 1 Sep .. 29 Dec
    const dates = [...days.flatMap((d) => [d, d, d, d, d, d, d, d, d, d]), "2026-04-03", "2026-05-02"];
    expect(fileSpan(dates, true)).toEqual({ from: "2025-09-01", to: "2025-12-29", capped: true });
    // a few rows on the last days (no gap) are real data, not strays
    expect(fileSpan([...days.slice(0, 100).flatMap((d) => [d, d, d]), "2025-12-23", "2025-12-30"], false)!.to).toBe("2025-12-30");
  });

  it("does not report a quiet Christmas between two files", () => {
    expect(
      missingSpans({ from: "2024-09-01", to: "2025-03-31" }, [
        { from: "2024-09-02", to: "2024-12-19", capped: false },
        { from: "2025-01-03", to: "2025-03-31", capped: false },
      ]),
    ).toEqual([]);
  });
});
