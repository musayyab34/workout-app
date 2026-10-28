import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  datesInMonth,
  localDateKey,
  mondayOfWeek,
  monthGrid,
  parseDateKey,
} from "../../src/features/statistics/calendar";

describe("calendar arithmetic", () => {
  it("uses Monday boundaries across years", () => {
    expect(mondayOfWeek("2027-01-01")).toBe("2026-12-28");
    expect(mondayOfWeek("2026-10-26")).toBe("2026-10-26");
    expect(mondayOfWeek("2026-11-01")).toBe("2026-10-26");
  });

  it("handles leap days and rejects impossible dates", () => {
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addCalendarDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(datesInMonth("2028-02")).toHaveLength(29);
    expect(() => parseDateKey("2027-02-29")).toThrow();
    expect(() => parseDateKey("2026-13-01")).toThrow();
    expect(() => parseDateKey("2026-10-00")).toThrow();
  });

  it("does not assume a local day is 24 hours", () => {
    expect(addCalendarDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addCalendarDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(localDateKey("2026-03-09T03:30:00Z", "America/New_York")).toBe(
      "2026-03-08",
    );
    expect(localDateKey("2026-03-09T04:30:00Z", "America/New_York")).toBe(
      "2026-03-09",
    );
  });

  it("builds full Monday-first weeks without shifting date labels", () => {
    const grid = monthGrid("2026-11");
    expect(grid[0]).toBe("2026-10-26");
    expect(grid.at(-1)).toBe("2026-12-06");
    expect(grid.length % 7).toBe(0);
    expect(() => datesInMonth("2026-00")).toThrow();
  });
});
