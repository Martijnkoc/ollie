import { describe, expect, it } from "vitest";
import { ageOn, datePhase, formatMoment, parseLocal, toLocalInput } from "@/lib/time";

describe("time helpers", () => {
  it("reads datetime-local input as Dutch time, summer and winter", () => {
    expect(parseLocal("2026-07-01T20:00")!.toISOString()).toBe("2026-07-01T18:00:00.000Z");
    expect(parseLocal("2026-12-01T20:00")!.toISOString()).toBe("2026-12-01T19:00:00.000Z");
    expect(toLocalInput(new Date("2026-12-01T19:00:00Z"))).toBe("2026-12-01T20:00");
  });

  it("rejects malformed and non-existent times", () => {
    expect(parseLocal("morgen")).toBeNull();
    expect(parseLocal("2026-03-29T02:30")).toBeNull(); // clocks jump from 02:00 to 03:00
  });

  it("formats in Dutch", () => {
    expect(formatMoment(new Date("2026-10-15T18:00:00Z"))).toBe("donderdag 15 oktober om 20:00");
  });

  it("knows the phases of a twenty-minute date", () => {
    const start = new Date("2026-10-15T18:00:00Z");
    const at = (iso: string) => datePhase(start, new Date(iso));
    expect(at("2026-10-15T17:50:00Z")).toBe("upcoming");
    expect(at("2026-10-15T17:56:00Z")).toBe("lobby");
    expect(at("2026-10-15T18:19:59Z")).toBe("live");
    expect(at("2026-10-15T18:20:00Z")).toBe("ended");
  });

  it("computes age in full years", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    expect(ageOn("2008-10-12", now)).toBe(18);
    expect(ageOn("2008-10-13", now)).toBe(17);
  });
});

describe("moment picker", () => {
  it("starts on a quarter hour so step=900 accepts round times", async () => {
    const { earliestMomentInput } = await import("@/lib/time");
    expect(earliestMomentInput(15, new Date("2026-10-12T09:22:10Z"))).toBe("2026-10-12T11:45");
    expect(earliestMomentInput(15, new Date("2026-10-12T09:30:00Z"))).toBe("2026-10-12T11:45");
  });
});
