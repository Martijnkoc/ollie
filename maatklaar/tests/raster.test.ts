import { describe, expect, it } from "vitest";
import { decimalPosition, readDimensionText, scaleConsensus, type DimensionReading } from "@/lib/plan-analysis/dimensions";
import { polygonArea } from "@/lib/plan-analysis/rooms-auto";
import {
  components,
  distanceTo,
  emptyMask,
  flattenBackground,
  open,
  orthogonalize,
  simplifyClosed,
  traceOutline,
  type Mask,
} from "@/lib/plan-analysis/raster";

function maskFrom(rows: string[]): Mask {
  const m = emptyMask(rows[0]!.length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => (m.data[y * m.w + x] = ch === "#" ? 1 : 0)));
  return m;
}

function fill(m: Mask, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m.data[y * m.w + x] = 1;
}

describe("rasterbewerkingen", () => {
  it("afstandstransformatie is exact euclidisch", () => {
    const m = emptyMask(7, 7);
    m.data[3 * 7 + 3] = 1;
    const d = distanceTo(m, 1);
    expect(d[3 * 7 + 3]).toBe(0);
    expect(d[3 * 7 + 6]).toBe(3);
    expect(d[0]).toBeCloseTo(Math.hypot(3, 3), 6);
  });

  it("opening verwijdert dunne lijnen (tekst, maatlijnen) en laat wanden op ware grootte staan", () => {
    const m = emptyMask(60, 40);
    fill(m, 5, 5, 55, 15); // wall, 10 px thick
    fill(m, 5, 30, 55, 32); // thin line, 2 px
    const o = open(m, 2.5);
    expect(o.data[10 * 60 + 30]).toBe(1);
    expect(o.data[31 * 60 + 30]).toBe(0);
    let wall = 0;
    for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) wall += o.data[y * 60 + x]!;
    expect(wall).toBeGreaterThanOrEqual(50 * 10 - 8); // only the corners may round off a little
  });

  it("volgt de omtrek van een L-vormige ruimte en maakt er zes rechte hoeken van", () => {
    const m = maskFrom(["..........", ".######...", ".######...", ".########.", ".########.", ".........."]);
    const { labels } = components(m, 1);
    const traced = traceOutline(labels, m.w, m.h, 1);
    const poly = orthogonalize(simplifyClosed(traced, 0.5), 1);
    expect(poly).toHaveLength(6);
    expect(polygonArea(poly)).toBe(6 * 2 + 8 * 2);
  });

  it("maakt gekleurde vlakken wit voor OCR, maar laat tekst donker", () => {
    const w = 40;
    const h = 20;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) rgba.set([150, 171, 198, 255], i * 4); // blue bathroom fill
    for (let y = 8; y < 12; y++) for (let x = 18; x < 21; x++) rgba.set([51, 51, 51, 255], (y * w + x) * 4); // a text stroke
    const out = flattenBackground(rgba, w, h, 6);
    expect(out[(2 * w + 2) * 4]).toBeGreaterThan(250);
    expect(out[(10 * w + 19) * 4]).toBeLessThan(90);
  });
});

describe("maatlijnen lezen", () => {
  it("leest waarden met eenheid en decimaal", () => {
    expect(readDimensionText("5.45 m")?.mm).toBe(5450);
    expect(readDimensionText("5,45m")?.mm).toBe(5450);
    expect(readDimensionText("0.90 rn")?.mm).toBe(900);
    // Without the shapes, a lost decimal point is never guessed.
    expect(readDimensionText("545m")).toBeNull();
    expect(readDimensionText("abc")).toBeNull();
  });

  it("zet een weggevallen decimaalpunt alleen terug als de vorm het aanwijst", () => {
    // Glyphs "5", ".", "4", "5", "m" as blocks: tall digits, a small dot on the baseline after the first.
    const w = 120;
    const h = 40;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    const block = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([0, 0, 0, 255], (y * w + x) * 4);
    };
    block(5, 5, 20, 35);
    block(24, 30, 28, 35); // the dot
    block(32, 5, 47, 35);
    block(51, 5, 66, 35);
    block(75, 15, 100, 35); // "m"
    const crop = { data, w, h };
    expect(decimalPosition(crop, 4)).toBe(1);
    expect(readDimensionText("545m", crop)?.mm).toBe(5450);
    // A different number of glyphs than characters read: no repair.
    expect(decimalPosition(crop, 5)).toBeNull();
  });
});

describe("schaal uit maatlijnen", () => {
  const line = (axis: "h" | "v", mm: number, px: number): DimensionReading => ({
    axis,
    at: 0,
    from: 100,
    to: 100 + px,
    label: { x0: 0, y0: 0, x1: 10, y1: 10 },
    mm,
    text: `${(mm / 1000).toFixed(2)}m`,
  });

  it("kiest de schaal waar de meeste lijnen het over eens zijn en negeert een verkeerd gelezen lijn", () => {
    const c = scaleConsensus([
      line("h", 5450, 690),
      line("v", 9300, 1177),
      line("h", 2200, 278),
      line("v", 2700, 342),
      line("h", 2100, 366),
    ]);
    expect(c).not.toBeNull();
    expect(c!.inliers).toHaveLength(4);
    expect(c!.outliers.map((o) => o.mm)).toEqual([2100]);
    expect(1000 / c!.mmPerPx).toBeCloseTo(126.6, 0);
    expect(c!.stepMm).toBe(50);
  });

  it("geeft geen schaal als de lijnen elkaar tegenspreken", () => {
    expect(scaleConsensus([line("h", 5000, 500), line("v", 5000, 700)])).toBeNull();
    expect(scaleConsensus([line("h", 5000, 500)])).toBeNull();
  });
});
