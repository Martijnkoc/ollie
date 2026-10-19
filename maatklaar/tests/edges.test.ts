import { describe, expect, it } from "vitest";
import { findEdge, refineQuad } from "@/lib/measurements/edges";
import { dist, measureInPlane, project, type Marked, type Pt } from "@/lib/measurements/photo";
import { renderScene } from "./support/scene";

/**
 * A grey photo of a window, drawn from millimetres with a known camera: wall, frame, a darker opening and an
 * A4 sheet on the glass. Taps are a few pixels off, like a finger; the edges bring them back.
 */
const H = [0.9, 0.1, 260, -0.05, 0.95, 90, 0.00008, 0.00002, 1];
const photo = renderScene({
  h: H,
  w: 1600,
  height: 1700,
  background: 196,
  rects: [
    { x0: -90, y0: -90, x1: 1290, y1: 1590, value: 238 }, // frame
    { x0: 0, y0: 0, x1: 1200, y1: 1500, value: 112 }, // glass in the opening
    { x0: 400, y0: 300, x1: 610, y1: 597, value: 252 }, // A4 sheet
  ],
  noise: 4,
});
const corners = (x0: number, y0: number, x1: number, y1: number): Pt[] =>
  [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ].map((p) => project(H, p));
const sheet = corners(400, 300, 610, 597);
const opening = corners(0, 0, 1200, 1500);
// Finger taps: 2 to 5 px off in different directions.
const offsets = [
  { x: 3, y: -2 },
  { x: -4, y: 3 },
  { x: 2, y: 5 },
  { x: -5, y: -2 },
];
const tapped = (q: Pt[]): Marked[] => q.map((p, i) => ({ x: p.x + offsets[i]!.x, y: p.y + offsets[i]!.y, sigma: 2 }));

describe("hoeken vastklikken op randen in de foto", () => {
  it("vindt een rechte rand tot op een fractie van een pixel", () => {
    const fit = findEdge(photo, tapped(sheet)[0]!, tapped(sheet)[1]!, 8)!;
    expect(fit).not.toBeNull();
    // Distance of the true top-left and top-right corner to the fitted line.
    for (const p of [sheet[0]!, sheet[1]!]) {
      const off = -(p.x - fit.line.p.x) * fit.line.d.y + (p.y - fit.line.p.y) * fit.line.d.x;
      expect(Math.abs(off)).toBeLessThan(0.3);
    }
  });

  it("zet getikte hoeken van het A4-vel en de opening terug op hun echte plek", () => {
    for (const quad of [sheet, opening]) {
      const { corners: refined, refined: ok } = refineQuad(photo, tapped(quad), 10);
      expect(ok).toEqual([true, true, true, true]);
      refined.forEach((c, i) => {
        expect(dist(c, quad[i]!)).toBeLessThan(0.4);
        expect(c.sigma).toBeLessThan(0.6);
      });
    }
  });

  it("meet de opening dan tot op enkele millimeters, binnen de opgegeven foutmarge", () => {
    const ref = refineQuad(photo, tapped(sheet), 10).corners;
    const marks = refineQuad(photo, tapped(opening), 10).corners;
    const r = measureInPlane([ref], "a4", { kind: "rect" }, marks);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const truth = [1200, 1200, 1200, 1500, 1500, 1500];
    r.values.forEach((v, i) => {
      const error = Math.abs(v.mm - truth[i]!);
      expect(error).toBeLessThan(4);
      expect(error).toBeLessThanOrEqual(v.uncertaintyMm);
    });
    // Without the edges, the same taps are much further off.
    const raw = measureInPlane([tapped(sheet)], "a4", { kind: "rect" }, tapped(opening));
    expect(raw.ok).toBe(true);
    if (raw.ok) expect(Math.max(...raw.values.map((v, i) => Math.abs(v.mm - truth[i]!)))).toBeGreaterThan(10);
  });

  it("verzint geen rand waar er geen is: een egale muur houdt de getikte hoeken", () => {
    const blank = renderScene({ h: H, w: 400, height: 400, background: 200, rects: [], noise: 3 });
    const quad: Marked[] = [
      { x: 100, y: 100, sigma: 2 },
      { x: 300, y: 100, sigma: 2 },
      { x: 300, y: 300, sigma: 2 },
      { x: 100, y: 300, sigma: 2 },
    ];
    const r = refineQuad(blank, quad, 10);
    expect(r.refined).toEqual([false, false, false, false]);
    expect(r.corners).toEqual(quad);
  });
});
