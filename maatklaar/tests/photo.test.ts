import { describe, expect, it } from "vitest";
import { compareWithPhoto, estimateOpening, homography, project, type Pt } from "@/lib/measurements/photo";

/**
 * A synthetic photo: a wall plane in millimetres seen in perspective. The window opening is 1200 × 1500 mm,
 * an A4 sheet (portrait) is taped on the glass. We project both into "photo" pixels with a known camera
 * homography and check that the estimate recovers the true sizes.
 */
// About 2 px per mm, like a phone photo of a window from a few metres; with a mild perspective.
const camera = [2.1, 0.3, 310, -0.15, 2.35, 120, 0.00006, 0.00003, 1];
const lowRes = [0.42, 0.06, 310, -0.03, 0.47, 120, 0.00006, 0.00003, 1];
const toPhoto = (p: Pt, h = camera) => project(h, p);
const window: Pt[] = [
  { x: 0, y: 0 },
  { x: 1200, y: 0 },
  { x: 1200, y: 1500 },
  { x: 0, y: 1500 },
].map((p) => toPhoto(p));
const sheet: Pt[] = [
  { x: 400, y: 500 },
  { x: 610, y: 500 },
  { x: 610, y: 797 },
  { x: 400, y: 797 },
].map((p) => toPhoto(p));

describe("raammaat schatten uit een foto met een A4-vel", () => {
  it("de homografie beeldt vier punten exact af", () => {
    const from = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const to = from.map((p) => toPhoto(p));
    const h = homography(from, to)!;
    for (let i = 0; i < 4; i++) {
      expect(project(h, from[i]!).x).toBeCloseTo(to[i]!.x, 6);
      expect(project(h, from[i]!).y).toBeCloseTo(to[i]!.y, 6);
    }
  });

  it("vindt de werkelijke breedte en hoogte terug, ook in perspectief", () => {
    const r = estimateOpening(sheet, window);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estimate.topMm).toBeCloseTo(1200, 0);
    expect(r.estimate.bottomMm).toBeCloseTo(1200, 0);
    expect(r.estimate.leftMm).toBeCloseTo(1500, 0);
    expect(r.estimate.rightMm).toBeCloseTo(1500, 0);
    // The tap uncertainty is reported, not hidden: a few mm per 2 px.
    expect(r.estimate.uncertaintyMm).toBeGreaterThan(0);
    expect(r.estimate.uncertaintyMm).toBeLessThan(25);
  });

  it("meldt een grote onzekerheid bij een kleine, onscherpe foto in plaats van die te verbergen", () => {
    const quad = (pts: Pt[]) => pts.map((p) => toPhoto(p, lowRes));
    const r = estimateOpening(
      quad([
        { x: 400, y: 500 },
        { x: 610, y: 500 },
        { x: 610, y: 797 },
        { x: 400, y: 797 },
      ]),
      quad([
        { x: 0, y: 0 },
        { x: 1200, y: 0 },
        { x: 1200, y: 1500 },
        { x: 0, y: 1500 },
      ]),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estimate.uncertaintyMm).toBeGreaterThan(60);
  });

  it("weigert hoeken in de verkeerde volgorde en onaannemelijke uitkomsten", () => {
    expect(estimateOpening([sheet[0]!, sheet[2]!, sheet[1]!, sheet[3]!], window).ok).toBe(false);
    const tiny = window.map((p) => ({ x: p.x / 50 + 400, y: p.y / 50 + 300 }));
    expect(estimateOpening(sheet, tiny).ok).toBe(false);
  });

  it("vergelijkt een gemeten maat met de schatting", () => {
    expect(compareWithPhoto(1203, 1200, 8).agrees).toBe(true);
    expect(compareWithPhoto(1300, 1200, 8)).toEqual({ gapMm: 100, agrees: false });
  });
});
