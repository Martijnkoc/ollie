import { describe, expect, it } from "vitest";
import { combine, estimateOpening, homography, measureInPlane, project, tooRough, type Marked, type Pt } from "@/lib/measurements/photo";

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
});

const marked = (pts: Pt[], sigma: number): Marked[] => pts.map((p) => ({ ...p, sigma }));

describe("meten in het vlak van een referentie", () => {
  it("meet een rechthoek met zes maten, inclusief de middenmaten", () => {
    const r = measureInPlane([marked(sheet, 0.5)], "a4", { kind: "rect" }, marked(window, 1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [top, midW, bottom, left, midH, right] = r.values.map((v) => v.mm);
    for (const w of [top, midW, bottom]) expect(w).toBeCloseTo(1200, 1);
    for (const h of [left, midH, right]) expect(h).toBeCloseTo(1500, 1);
    // The uncertainty contains the assumed systematic share (0,5 %) and the propagated tap error.
    for (const v of r.values) {
      expect(v.systematicMm).toBeCloseTo(v.mm * 0.005, 3);
      expect(v.randomMm).toBeGreaterThan(0);
      expect(v.uncertaintyMm).toBeGreaterThanOrEqual(Math.ceil(v.systematicMm));
    }
  });

  it("een preciezere referentie geeft een kleinere foutmarge", () => {
    const rough = measureInPlane([marked(sheet, 2)], "a4", { kind: "rect" }, marked(window, 2));
    const sharp = measureInPlane([marked(sheet, 0.3)], "a4", { kind: "rect" }, marked(window, 0.3));
    expect(rough.ok && sharp.ok).toBe(true);
    if (!rough.ok || !sharp.ok) return;
    expect(sharp.values[0]!.randomMm).toBeLessThan(rough.values[0]!.randomMm / 3);
  });

  it("meet losse maten met een bankpas als referentie: de diepte van de dag", () => {
    // A bank card (85,6 × 53,98 mm) on the side of the recess; the recess is 140 mm deep.
    // Close up, about 4 px per mm, seen at an angle.
    const side = [4, 0.6, 500, 0.1, 4.4, 300, 0.0016, 0.0006, 1];
    const at = (x: number, y: number) => project(side, { x, y });
    const card = [at(20, 30), at(105.6, 30), at(105.6, 83.98), at(20, 83.98)];
    const r = measureInPlane([marked(card, 0.5)], "bankpas", { kind: "lines", count: 1 }, marked([at(0, 120), at(140, 120)], 1), {
      minMm: 10,
      maxMm: 1000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values[0]!.mm).toBeCloseTo(140, 1);
  });

  it("weigert ontbrekende of samenvallende punten", () => {
    expect(measureInPlane([marked(sheet, 1)], "a4", { kind: "rect" }, marked(window.slice(0, 3), 1)).ok).toBe(false);
    expect(measureInPlane([marked(sheet, 1)], "a4", { kind: "lines", count: 1 }, marked([window[0]!, window[0]!], 1)).ok).toBe(false);
  });

  it("twee vellen aan weerszijden maken het perspectief en dus de maat veel zekerder", () => {
    // Same camera; one sheet beside the opening versus one on each side. Their relative position is not given.
    const sheetAt = (x: number, y: number, sigma: number) =>
      marked(
        [
          { x, y },
          { x: x + 210, y },
          { x: x + 210, y: y + 297 },
          { x, y: y + 297 },
        ].map((p) => toPhoto(p)),
        sigma,
      );
    const one = measureInPlane([sheetAt(1340, 600, 0.2)], "a4", { kind: "rect" }, marked(window, 0.2));
    const two = measureInPlane([sheetAt(-350, 600, 0.2), sheetAt(1340, 620, 0.2)], "a4", { kind: "rect" }, marked(window, 0.2));
    expect(one.ok && two.ok).toBe(true);
    if (!one.ok || !two.ok) return;
    two.values.forEach((v, i) => expect(v.mm).toBeCloseTo(i < 3 ? 1200 : 1500, 1));
    expect(two.values[0]!.randomMm).toBeLessThan(one.values[0]!.randomMm / 5);
    // Exact corners: the two sheets fit together perfectly.
    expect(two.consistency).toBeLessThan(0.01);
  });

  it("ziet dat twee vellen niet bij elkaar passen (een ander formaat of niet in hetzelfde vlak)", () => {
    const quad = (x: number, y: number, w: number, h: number) =>
      marked(
        [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ].map((p) => toPhoto(p)),
        0.3,
      );
    // The second "A4" is really a letter-size sheet (216 × 279 mm).
    const r = measureInPlane([quad(-350, 600, 210, 297), quad(1340, 620, 216, 279)], "a4", { kind: "rect" }, marked(window, 0.3));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("passen niet bij elkaar");
  });

  it("combineert foto's alleen als ze het eens zijn, en houdt de systematische marge", () => {
    const a = { mm: 1200, randomMm: 4, systematicMm: 6, uncertaintyMm: 8 };
    const b = { mm: 1203, randomMm: 4, systematicMm: 6, uncertaintyMm: 8 };
    const both = combine([a, b])!;
    expect(both).toMatchObject({ mm: 1201.5, shots: 2, spreadMm: 3, agree: true });
    expect(both.uncertaintyMm).toBeGreaterThanOrEqual(6);
    expect(both.uncertaintyMm).toBeLessThanOrEqual(8);
    const off = combine([a, { ...b, mm: 1230 }])!;
    expect(off.agree).toBe(false);
    expect(off.uncertaintyMm).toBeGreaterThanOrEqual(15);
  });

  it("noemt een maat met meer dan 5 % foutmarge te onnauwkeurig", () => {
    expect(tooRough({ mm: 1000, uncertaintyMm: 40 })).toBe(false);
    expect(tooRough({ mm: 1000, uncertaintyMm: 60 })).toBe(true);
  });
});
