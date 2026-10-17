import { describe, expect, it } from "vitest";
import { addDays, formatTime, isValidDay, localDay, localDayRange, shortSeasonName } from "@/lib/time";

const hours = (r: { start: Date; end: Date }) => (r.end.getTime() - r.start.getTime()) / 3_600_000;

describe("Dutch calendar days", () => {
  it("assigns late UTC evening kick-offs to the next Dutch day", () => {
    // 22:30 UTC on 17 October is 00:30 on 18 October in Amsterdam (summer time).
    expect(localDay(new Date("2026-10-17T22:30:00Z"))).toBe("2026-10-18");
    expect(localDay(new Date("2026-10-17T21:59:00Z"))).toBe("2026-10-17");
    // Winter time: midnight is 23:00 UTC.
    expect(localDay(new Date("2026-12-01T23:00:00Z"))).toBe("2026-12-02");
    expect(localDay(new Date("2026-12-01T22:59:00Z"))).toBe("2026-12-01");
  });

  it("has 23 and 25 hour days around the clock changes", () => {
    expect(hours(localDayRange("2026-03-29"))).toBe(23);
    expect(hours(localDayRange("2026-10-25"))).toBe(25);
    expect(hours(localDayRange("2026-10-17"))).toBe(24);
    expect(localDayRange("2026-10-17").start.toISOString()).toBe("2026-10-16T22:00:00.000Z");
    expect(localDayRange("2026-12-01").start.toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });

  it("formats times in Dutch time regardless of the server time zone", () => {
    expect(formatTime(new Date("2026-10-17T18:45:00Z"))).toBe("20:45");
    expect(formatTime(new Date("2026-12-05T19:00:00Z"))).toBe("20:00");
  });

  it("validates and moves days", () => {
    expect(isValidDay("2026-02-29")).toBe(false);
    expect(isValidDay("2028-02-29")).toBe(true);
    expect(isValidDay("2026-13-01")).toBe(false);
    expect(isValidDay("17-10-2026")).toBe(false);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("shortens season names", () => {
    expect(shortSeasonName("2026/2027")).toBe("2026/27");
    expect(shortSeasonName("2026")).toBe("2026");
  });
});
