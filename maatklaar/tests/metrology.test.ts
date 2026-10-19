import { describe, expect, it } from "vitest";
import { metrologyReport, percentile } from "@/lib/scantag/metrology";

describe("statistiek voor de fysieke validatie", () => {
  it("percentielen volgens de nearest-rank-methode", () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 99)).toBe(99);
    expect(percentile([], 95)).toBeNull();
  });

  it("fouten, dekking, false accepts en false rejects", () => {
    const r = metrologyReport(
      [
        { truthMm: 1000, measuredMm: 1002, uncertaintyMm: 5, accepted: true },
        { truthMm: 1000, measuredMm: 994, uncertaintyMm: 5, accepted: true }, // error 6 > u 5 and > tolerance 5: false accept
        { truthMm: 1000, measuredMm: 1001, uncertaintyMm: 9, accepted: false }, // within tolerance but rejected: false reject
        { truthMm: 1000, measuredMm: null, uncertaintyMm: null, accepted: false }, // dropout
      ],
      5,
    );
    expect(r).toMatchObject({ n: 4, dropoutRate: 0.25, maxAbsMm: 6, medianAbsMm: 2 });
    expect(r.coverage).toBeCloseTo(2 / 3, 6);
    expect(r.falseAcceptRate).toBeCloseTo(1 / 2, 6);
    expect(r.falseRejectRate).toBeCloseTo(1 / 2, 6);
  });
});
