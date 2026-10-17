import { describe, expect, it } from "vitest";
import { hasScore, isFinished, isLive, liveClock, MATCH_STATUSES, rowClock, statusCategory, statusLabel } from "@/lib/football/status";

describe("match statuses", () => {
  it("never treats postponed, cancelled or abandoned matches as finished", () => {
    for (const s of ["postponed", "cancelled", "abandoned", "suspended"] as const) {
      expect(isFinished(s)).toBe(false);
      expect(statusCategory(s)).toBe("off");
    }
    expect(hasScore("postponed")).toBe(false);
    expect(hasScore("cancelled")).toBe(false);
    expect(hasScore("time_tba")).toBe(false);
    // An abandoned match keeps the score at the moment it stopped, clearly labelled.
    expect(hasScore("abandoned")).toBe(true);
  });

  it("covers half time, extra time and penalties as live", () => {
    for (const s of [
      "first_half",
      "half_time",
      "second_half",
      "break_before_et",
      "extra_time",
      "extra_time_break",
      "penalties",
      "interrupted",
    ] as const) {
      expect(isLive(s)).toBe(true);
    }
  });

  it("has a Dutch label for every status", () => {
    for (const s of MATCH_STATUSES) expect(statusLabel(s).length).toBeGreaterThan(2);
    expect(statusLabel("postponed")).toBe("Uitgesteld");
    expect(statusLabel("cancelled")).toBe("Geannuleerd");
    expect(statusLabel("finished_pen")).toBe("Afgelopen na strafschoppen");
  });

  it("formats the running clock, including stoppage time", () => {
    expect(liveClock("first_half", 37, null)).toBe("37'");
    expect(liveClock("first_half", 45, 2)).toBe("45+2'");
    expect(liveClock("half_time", null, null)).toBe("Rust");
    expect(liveClock("second_half", null, null)).toBe("Tweede helft");
  });

  it("shows the kick-off time for scheduled matches and a status otherwise", () => {
    expect(rowClock("scheduled", null, null, "20:00")).toBe("20:00");
    expect(rowClock("postponed", null, null, "20:00")).toBe("Uitgest.");
    expect(rowClock("finished", null, null, "20:00")).toBe("Einde");
    expect(rowClock("second_half", 67, null, "20:00")).toBe("67'");
  });
});
