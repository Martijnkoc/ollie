import { describe, expect, it } from "vitest";
import { freshnessOf } from "@/lib/football/freshness";

const now = new Date("2026-10-17T15:00:00Z");
const ago = (s: number) => new Date(now.getTime() - s * 1000);

describe("freshness of what we show", () => {
  it("marks a live score stale when it has not been confirmed for several poll intervals", () => {
    expect(freshnessOf("second_half", ago(3600), ago(40), now, 30)).toBe("fresh");
    expect(freshnessOf("second_half", ago(3600), ago(170), now, 30)).toBe("fresh");
    expect(freshnessOf("second_half", ago(3600), ago(181), now, 30)).toBe("stale");
    expect(freshnessOf("half_time", ago(3600), ago(400), now, 120)).toBe("stale");
  });

  it("flags a match that should have started but still says 'not started'", () => {
    expect(freshnessOf("scheduled", ago(5 * 60), ago(60), now, 30)).toBe("fresh");
    expect(freshnessOf("scheduled", ago(15 * 60), ago(60), now, 30)).toBe("stale");
  });

  it("treats finished and called-off matches as final", () => {
    expect(freshnessOf("finished", ago(86400), ago(86400 * 30), now, 30)).toBe("final");
    expect(freshnessOf("postponed", ago(86400), ago(86400 * 30), now, 30)).toBe("final");
  });
});
