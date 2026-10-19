import { describe, expect, it } from "vitest";
import { mapEdge, mergePolygons, splitPolygon } from "@/lib/geometry/edit";
import { area } from "@/lib/geometry/polygon";

// Woonkamer with an open kitchen: L-shape 6,00 × 4,00 plus 3,40 × 1,60 (mm).
const L = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 3400, y: 4000 },
  { x: 3400, y: 5600 },
  { x: 0, y: 5600 },
];

describe("ruimtes splitsen en samenvoegen", () => {
  it("splitst langs een korte lijn binnen de ruimte, van wand tot wand", () => {
    const r = splitPolygon(L, { x: 1000, y: 4000 }, { x: 2000, y: 4000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const areas = r.parts.map((p) => area(p) / 1e6).sort((a, b) => a - b);
    expect(areas).toEqual([5.44, 24]);
    expect(areas[0]! + areas[1]!).toBeCloseTo(area(L) / 1e6, 9);
  });

  it("weigert een lijn buiten de ruimte of één die niet van wand tot wand loopt", () => {
    expect(splitPolygon(L, { x: 7000, y: 100 }, { x: 8000, y: 100 }).ok).toBe(false);
    expect(splitPolygon(L, { x: 4000, y: 4800 }, { x: 5000, y: 4800 }).ok).toBe(false);
    expect(splitPolygon(L, { x: 10, y: 10 }, { x: 10, y: 10 }).ok).toBe(false);
  });

  it("voegt de delen exact weer samen", () => {
    const r = splitPolygon(L, { x: 2000, y: 3000 }, { x: 2000, y: 2000 });
    if (!r.ok) throw new Error(r.reason);
    const m = mergePolygons(r.parts[0], r.parts[1]);
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(area(m.polygon)).toBeCloseTo(area(L), 6);
      expect(m.polygon).toHaveLength(6);
    }
  });

  it("voegt ruimtes met een wand ertussen niet samen", () => {
    const a = [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const b = a.map((p) => ({ x: p.x + 3100, y: p.y }));
    const m = mergePolygons(a, b);
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.reason).toMatch(/wand/);
  });

  it("houdt een deur op dezelfde wand na het splitsen", () => {
    const r = splitPolygon(L, { x: 1000, y: 4000 }, { x: 2000, y: 4000 });
    if (!r.ok) throw new Error(r.reason);
    // Edge 5 of L is the left wall (0,5600) → (0,0); after the split each part keeps a piece of it.
    const hits = r.parts.map((p) => mapEdge(L, 5, p));
    expect(hits.every((i) => i >= 0)).toBe(true);
    // The top wall (edge 0) only exists in the large part.
    expect(r.parts.map((p) => mapEdge(L, 0, p) >= 0).filter(Boolean)).toHaveLength(1);
  });
});
