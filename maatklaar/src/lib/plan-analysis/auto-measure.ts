import { formatMFromMm } from "@/lib/format";
import { findDimensionLines, scaleConsensus, type DimensionLine, type DimensionReading } from "./dimensions";
import type { Pt } from "./raster";
import { polygonArea, segmentRooms, sortRegions, type PlacedLabel, type RoomRegion } from "./rooms-auto";
import { detectWalls, findOpenings, type Opening, type WallModel } from "./walls";

/**
 * Automatic measuring of a rendered plan page: walls → openings → rooms, with the scale taken from the
 * dimension lines on the drawing. Runs entirely on the device (in a worker); nothing is uploaded.
 *
 * Everything this produces is a proposal with status "auto". Window and door widths are indicative: a plan
 * seen from above is not a measurement of a window (see CLAUDE.md, rule 6).
 */

/** Door openings wider than this stay open passages. */
const MAX_DOOR_MM = 1300;
/** Widest window or glass-door opening we close in an outer wall. */
const MAX_WINDOW_MM = 4500;
/** Smallest unnamed space we report (a meter cupboard is about 0,4 m²). */
const MIN_ROOM_M2 = 0.3;
/** The scale counts as proven when this many lines in both directions agree within this margin. */
const PROVEN_LINES = 3;
const PROVEN_UNCERTAINTY = 0.01;

export type AutoGeometry = { model: WallModel; lines: DimensionLine[] };

export type AutoRoom = {
  names: string[];
  /** Outline in page units, clockwise on screen. */
  polygon: Pt[];
  /** Where the name sits (page units), or the middle of the room. */
  anchor: Pt;
  areaMm2: number | null;
  /** Outer size of the outline: along x and along y. */
  widthMm: number | null;
  depthMm: number | null;
  /** Doors in the outline, by edge index; widths read from the drawing. */
  doors: { edge: number; widthMm: number }[];
  /** All checks passed: closed by walls, one name, clean outline and a proven scale. */
  ok: boolean;
  /** Every check except the name passed: becomes `ok` once a name is found for an unnamed space. */
  okIfNamed: boolean;
  notes: string[];
};

export type AutoOpening = {
  kind: "raam" | "deur";
  where: "gevel" | "binnen";
  /** Middle of the opening, page units. */
  position: Pt;
  /** Width of the gap in the wall on the drawing (indicative), when the scale is known. */
  widthMm: number | null;
  /** Indexes into `rooms`. */
  rooms: number[];
};

export type AutoMeasureResult = {
  scale: {
    mmPerUnit: number;
    lines: number;
    agreeing: number;
    /** 1 or 2: in how many directions (horizontal, vertical) agreeing lines were found. */
    directions: number;
    uncertainty: number;
    outliers: string[];
    proven: boolean;
  } | null;
  rooms: AutoRoom[];
  openings: AutoOpening[];
  reasons: string[];
};

export function measureGeometry(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): AutoGeometry | null {
  const model = detectWalls(rgba, w, h);
  if (!model) return null;
  return { model, lines: findDimensionLines(model) };
}

function inside(pt: Pt, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Edge of a room outline that runs along the face of an opening's wall band. */
function edgeAlong(poly: Pt[], op: Opening, tol: number) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    // For an opening in a horizontal wall the edge is horizontal: constant y, running along x.
    const [ca, cb, ta, tb] = op.axis === "h" ? [a.y, b.y, a.x, b.x] : [a.x, b.x, a.y, b.y];
    if (Math.abs(ca - cb) > 0.5) continue;
    if (Math.abs(ca - op.a) > tol && Math.abs(ca - op.b) > tol) continue;
    const overlap = Math.min(Math.max(ta, tb), op.to) - Math.max(Math.min(ta, tb), op.from);
    if (overlap >= (op.to - op.from) * 0.5) return i;
  }
  return -1;
}

function bbox(poly: Pt[]) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const m = (mm: number) => formatMFromMm(mm);

export function finishAutoMeasure(
  geo: AutoGeometry,
  readings: readonly DimensionReading[],
  labels: readonly PlacedLabel[],
  pxPerUnit: number,
): AutoMeasureResult {
  const { model } = geo;
  const reasons: string[] = [];
  const consensus = scaleConsensus(readings);
  const k = consensus?.mmPerPx ?? null;

  let scale: AutoMeasureResult["scale"] = null;
  if (consensus) {
    const directions = new Set(consensus.inliers.map((r) => r.axis)).size;
    const proven = consensus.inliers.length >= PROVEN_LINES && directions === 2 && consensus.uncertainty <= PROVEN_UNCERTAINTY;
    scale = {
      mmPerUnit: consensus.mmPerPx * pxPerUnit,
      lines: readings.length,
      agreeing: consensus.inliers.length,
      directions,
      uncertainty: consensus.uncertainty,
      outliers: consensus.outliers.map((r) => r.text),
      proven,
    };
    if (consensus.outliers.length)
      reasons.push(
        `${consensus.outliers.length} ${consensus.outliers.length === 1 ? "maatlijn past" : "maatlijnen passen"} niet bij de rest en ${consensus.outliers.length === 1 ? "is" : "zijn"} genegeerd (${consensus.outliers.map((r) => r.text).join(", ")}): misschien verkeerd gelezen.`,
      );
    if (!proven)
      reasons.push(
        directions < 2
          ? "De schaal is alleen in één richting gecontroleerd. Een uitgerekte afbeelding zouden we zo niet opmerken: meet één maat na."
          : "Te weinig maatlijnen om de schaal zeker te weten. Meet één maat na voordat je bevestigt.",
      );
  } else {
    reasons.push(
      readings.length
        ? "De maatlijnen op de tekening spreken elkaar tegen; we gebruiken ze niet. Kalibreer met één maat die je kent."
        : "We vonden geen maatlijnen met leesbare maten. Kalibreer met één maat die je kent; daarna rekenen we alle ruimtes direct uit.",
    );
  }

  const { openings, bridge } = findOpenings(model, k ? MAX_DOOR_MM / k : model.thin * 12, k ? MAX_WINDOW_MM / k : model.thick * 12);
  const minAreaPx = k ? (MIN_ROOM_M2 * 1e6) / (k * k) : (model.thick * 3) ** 2;
  const maxAreaPx = k ? (200 * 1e6) / (k * k) : model.w * model.h * 0.5;
  const regions: RoomRegion[] = sortRegions(segmentRooms(model, bridge, labels, { minAreaPx, maxAreaPx }));

  const tol = Math.max(3, model.thin * 0.6);
  const toPage = (p: Pt) => ({ x: p.x / pxPerUnit, y: p.y / pxPerUnit });
  const rooms: AutoRoom[] = regions.map((r) => {
    const b = bbox(r.polygon);
    const notes: string[] = [];
    const areaMm2 = k ? polygonArea(r.polygon) * k * k : null;
    const widthMm = k ? (b.x1 - b.x0) * k : null;
    const depthMm = k ? (b.y1 - b.y0) * k : null;
    if (k && consensus)
      notes.push(
        `Gemeten langs de wanden op de tekening, met de schaal uit ${consensus.inliers.length} maatlijnen (±${(consensus.uncertainty * 100).toFixed(1).replace(".", ",")} %).`,
      );
    else notes.push("Omtrek herkend langs de wanden op de tekening. Zodra de schaal bekend is, rekenen we de maten uit.");
    // Lines on the drawing that measure exactly this room: an independent second source.
    for (const line of consensus?.inliers ?? []) {
      const [lo, hi] = line.axis === "h" ? [b.x0, b.x1] : [b.y0, b.y1];
      if (Math.abs(line.from - lo) <= tol && Math.abs(line.to - hi) <= tol)
        notes.push(`De ${line.axis === "h" ? "breedte" : "diepte"} klopt met de maatlijn ${m(line.mm)} op de tekening.`);
    }
    if (r.names.length > 1)
      notes.push(`${r.names.join(" en ")} lopen zonder wand in elkaar over. We meten ze als één ruimte; een grens zou een gok zijn.`);
    if (r.openTo.length) notes.push(`De grens met ${r.openTo.join(" en ")} staat niet als wand op de tekening en is geschat.`);
    if (r.irregular) notes.push("De omtrek is niet overal recht herkend. Controleer de vorm op de tekening.");
    if (r.wallShare < 0.9) notes.push("Deze ruimte is niet rondom door wanden begrensd. Controleer de omtrek.");
    if (!r.names.length) notes.push("Geen naam gevonden. Geef deze ruimte een naam of verwijder hem.");
    const label = labels.find((l) => r.names.includes(l.name) && inside({ x: l.x, y: l.y }, r.polygon));
    const anchor = label ? { x: label.x, y: label.y } : { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    return {
      names: r.names,
      polygon: r.polygon.map(toPage),
      anchor: toPage(anchor),
      areaMm2,
      widthMm,
      depthMm,
      doors: [],
      notes: [...new Set(notes)],
      ok: Boolean(scale?.proven) && r.names.length === 1 && r.wallShare >= 0.9 && !r.irregular && r.openTo.length === 0,
      okIfNamed: Boolean(scale?.proven) && r.names.length <= 1 && r.wallShare >= 0.9 && !r.irregular && r.openTo.length === 0,
    };
  });

  const auto: AutoOpening[] = [];
  for (const op of openings) {
    const mid = (op.from + op.to) / 2;
    const probe = (s: number): Pt => (op.axis === "h" ? { x: mid, y: s } : { x: s, y: mid });
    const sides = [probe(op.a - 3), probe(op.b + 2)];
    const touching = regions.map((r, i) => (sides.some((p) => inside(p, r.polygon)) ? i : -1)).filter((i) => i >= 0);
    const widthMm = k ? (op.to - op.from) * k : null;
    const kind = op.where === "binnen" || op.symbol === "draaicirkel" ? "deur" : "raam";
    auto.push({ kind, where: op.where, position: toPage(probe((op.a + op.b) / 2)), widthMm, rooms: touching });
    if (kind !== "deur" || widthMm === null) continue;
    for (const i of touching) {
      const edge = edgeAlong(regions[i]!.polygon, op, tol);
      if (edge >= 0) rooms[i]!.doors.push({ edge, widthMm: Math.round(widthMm) });
    }
  }
  return { scale, rooms, openings: auto, reasons };
}
