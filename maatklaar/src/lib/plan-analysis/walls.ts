import {
  and,
  close,
  componentBounds,
  components,
  darkFromRgba,
  dilate,
  emptyMask,
  fillHoles,
  not,
  open,
  or,
  paperFromRgba,
  reachableFromBorder,
  rowRuns,
  transpose,
  type Bounds,
  type Mask,
} from "./raster";

/**
 * Wall recognition for plans that draw walls as filled dark bands (makelaars- and Zibber/Floorplanner-style
 * plattegronden, most CAD exports with poché). Plans that draw walls as two thin lines are not recognised;
 * the caller then falls back to manual drawing.
 */
export type WallModel = {
  w: number;
  h: number;
  wall: Mask;
  /** Typical thickness of inner and outer walls, in pixels. */
  thin: number;
  thick: number;
  /** Building interior including the walls themselves. */
  inside: Mask;
  /** Blank paper connected to the page edge. */
  outside: Mask;
  /** Thin drawn lines and text (darker than both sides), not fills; evidence for door and window symbols. */
  ink: Mask;
  /** Bounding box of all wall pixels. */
  bounds: Bounds;
};

/** Brightest channel at most this value counts as dark ink: black and near-black, never pastel fills or grey furniture. */
const DARK_LEVEL = 100;
/** Walls are drawn in one flat colour; furniture in the same dark tones is shaded. Accepted spread around that colour. */
const WALL_TONE_SPREAD = 12;

/** The dominant tone (brightest channel) of thick dark strokes: the colour the walls are drawn in. */
function wallTone(rgba: Uint8Array | Uint8ClampedArray, thick: Mask) {
  const hist = new Uint32Array(DARK_LEVEL + 1);
  for (let i = 0, p = 0; i < thick.data.length; i++, p += 4) {
    if (thick.data[i]) hist[Math.min(DARK_LEVEL, Math.max(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!))]!++;
  }
  let best = 0;
  for (let v = 1; v <= DARK_LEVEL; v++) if (hist[v]! > hist[best]!) best = v;
  return best;
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))]!;
}

/** Thickness samples: lengths of short runs across walls, in both directions. */
function wallThickness(wall: Mask, maxRun: number) {
  const samples: number[] = [];
  const collect = (m: Mask) => {
    for (let y = 0; y < m.h; y++) for (const r of rowRuns(m, y)) if (r.end - r.start <= maxRun) samples.push(r.end - r.start);
  };
  collect(wall);
  collect(transpose(wall));
  samples.sort((a, b) => a - b);
  return { thin: percentile(samples, 0.1), thick: percentile(samples, 0.9), samples: samples.length };
}

/**
 * Thin lines: pixels clearly darker than the pixels a few steps away on both sides (across the line).
 * A flat colour fill is not darker than its surroundings, so room colours do not count as lines.
 */
function lineInk(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): Mask {
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    const a = rgba[p + 3]! / 255;
    lum[i] = (0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!) * a + 255 * (1 - a);
  }
  const out = emptyMask(w, h);
  const contrast = 25;
  for (let y = 4; y < h - 4; y++) {
    for (let x = 4; x < w - 4; x++) {
      const i = y * w + x;
      const v = lum[i]! + contrast;
      for (let k = 2; k <= 4; k++) {
        if ((v < lum[i - k]! && v < lum[i + k]!) || (v < lum[i - k * w]! && v < lum[i + k * w]!)) {
          out.data[i] = 1;
          break;
        }
      }
    }
  }
  return out;
}

export function detectWalls(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): WallModel | null {
  const long = Math.max(w, h);
  const dark = darkFromRgba(rgba, w, h, DARK_LEVEL);
  // Text, dimension lines, door swings and furniture outlines are thin strokes; walls are not.
  const r = Math.min(5, Math.max(1.5, long * 0.0016));
  const tone = wallTone(rgba, open(dark, r));
  const toned = emptyMask(w, h);
  for (let i = 0, p = 0; i < toned.data.length; i++, p += 4) {
    if (!dark.data[i]) continue;
    const v = Math.max(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!);
    toned.data[i] = Math.abs(v - tone) <= WALL_TONE_SPREAD ? 1 : 0;
  }
  const thickInk = open(toned, r);

  const { labels, count, sizes } = components(thickInk, 1);
  if (!count) return null;
  const bounds = componentBounds(labels, w, count);
  const largest = Math.max(...sizes.slice(1));
  const keep = new Uint8Array(count + 1);
  for (let id = 1; id <= count; id++) {
    const b = bounds[id]!;
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    const size = sizes[id]!;
    const elongated = Math.max(bw, bh) >= long * 0.03 && Math.max(bw, bh) / Math.min(bw, bh) >= 3;
    // A loop of walls (a separate shed) is hollow; a black appliance or chair is solid.
    const hollow = size / (bw * bh) <= 0.35 && Math.min(bw, bh) >= long * 0.02;
    if (size >= largest * 0.15 || elongated || hollow) keep[id] = 1;
  }
  const maskOf = (ids: Uint8Array) => {
    const core = emptyMask(w, h);
    for (let p = 0; p < labels.length; p++) core.data[p] = ids[labels[p]!]!;
    // Give back the anti-aliased edge pixels the tone filter dropped, so wall faces sit where they are drawn.
    return and(dilate(core, 1.5), dark);
  };
  const boundsOf = (m: Mask) => {
    const all: Bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (let p = 0; p < m.data.length; p++) {
      if (!m.data[p]) continue;
      const x = p % w;
      const y = (p - x) / w;
      if (x < all.x0) all.x0 = x;
      if (x > all.x1) all.x1 = x;
      if (y < all.y0) all.y0 = y;
      if (y > all.y1) all.y1 = y;
    }
    return all;
  };
  let wall = maskOf(keep);
  let all = boundsOf(wall);
  if (!Number.isFinite(all.x0)) return null;
  const { thin, thick, samples } = wallThickness(wall, long * 0.06);
  if (samples < 50 || thick < 2) return null;

  // Short wall pieces between two windows are separate blocks on the facade line. Keep blocks of wall
  // thickness that sit on the outline of the building; leave blocks inside rooms (furniture) out.
  let added = false;
  for (let id = 1; id <= count; id++) {
    if (keep[id]) continue;
    const b = bounds[id]!;
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    const near = thick * 1.5;
    const within = b.x0 >= all.x0 - 2 && b.x1 <= all.x1 + 2 && b.y0 >= all.y0 - 2 && b.y1 <= all.y1 + 2;
    const onOutline = b.x0 - all.x0 <= near || all.x1 - b.x1 <= near || b.y0 - all.y0 <= near || all.y1 - b.y1 <= near;
    const wallLike = Math.min(bw, bh) >= thin * 0.6 && Math.min(bw, bh) <= thick * 1.6;
    if (within && onOutline && wallLike) ((keep[id] = 1), (added = true));
  }
  if (added) {
    wall = maskOf(keep);
    all = boundsOf(wall);
  }

  // Outside 1: blank paper reachable from the page edge. Window frames and door thresholds are drawn as
  // thin lines across the wall gap, so paper does not leak into rooms through them.
  const outside = reachableFromBorder(and(paperFromRgba(rgba, w, h), not(wall)));
  // Outside 2: everything not enclosed by the walls once gaps up to a wide window are closed. This catches
  // plans where an opening has no threshold line (paper would leak in).
  const hull = fillHoles(close(wall, Math.min(long * 0.08, Math.max(long * 0.02, thick * 4))));
  const inside = emptyMask(w, h);
  for (let y = Math.max(0, all.y0); y <= Math.min(h - 1, all.y1); y++) {
    for (let x = Math.max(0, all.x0); x <= Math.min(w - 1, all.x1); x++) {
      const p = y * w + x;
      inside.data[p] = hull.data[p]! | (outside.data[p] ? 0 : 1);
    }
  }
  const ink = lineInk(rgba, w, h);
  return { w, h, wall, thin, thick, inside: or(inside, wall), outside, ink, bounds: all };
}

export type Opening = {
  /** "h": an opening in a horizontal wall (the gap runs along x); "v": in a vertical wall. */
  axis: "h" | "v";
  /** Gap along the wall, half-open, in pixels. */
  from: number;
  to: number;
  /** Extent across the wall (the wall band), half-open. */
  a: number;
  b: number;
  /**
   * Wall ends on both sides (window or door in a straight wall), a wall end facing a wall (door next to a
   * corner), or two walls joined only by drawn lines (cupboard and sliding doors drawn closed).
   */
  between: "walls" | "corner" | "lines";
  /** In the outer wall (window or outside door) or between two inside spaces. */
  where: "gevel" | "binnen";
  /** What is drawn in the gap: frame or threshold lines, a door swing, or nothing. */
  symbol: "lijnen" | "draaicirkel" | "geen";
};

type Candidate = { at: number; from: number; to: number; between: Opening["between"]; leftEnd: boolean; rightEnd: boolean };
type Band = Candidate & { a: number; froms: number[]; tos: number[] };

const median = (v: number[]) => [...v].sort((x, y) => x - y)[v.length >> 1]!;

/** For every pixel: length of the vertical run of 1-pixels it belongs to (0 outside the mask). */
function verticalRunLengths(m: Mask): Int32Array {
  const out = new Int32Array(m.w * m.h);
  for (let x = 0; x < m.w; x++) {
    let y = 0;
    while (y < m.h) {
      if (!m.data[y * m.w + x]) {
        y++;
        continue;
      }
      const start = y;
      while (y < m.h && m.data[y * m.w + x]) y++;
      for (let k = start; k < y; k++) out[k * m.w + x] = y - start;
    }
  }
  return out;
}

/**
 * Gaps between two wall runs on one row. A side is a wall *end* when the wall there is no thicker than a
 * wall band (the tip of a wall); it is a wall *face* when the wall continues across the row (a wall running
 * the other way). Two ends: a gap in a straight wall. One end facing a face: a door next to a corner.
 * Two faces: just the space between two walls, never an opening.
 */
function openingsAlongRows(
  wall: Mask,
  inside: Mask,
  ink: Mask,
  o: { maxDoor: number; maxWindow: number; minBand: number; maxBand: number; lineGap: number },
) {
  const across = verticalRunLengths(wall);
  const found: { from: number; to: number; a: number; b: number; between: Opening["between"] }[] = [];
  let active: Band[] = [];
  // Rows where a drawn line closes the space between two walls, grouped into short stacks (double lines).
  // A door drawn closed is two or more parallel lines within one wall thickness; a single line (a stair
  // tread, a worktop edge) is not.
  let stacks: { from: number; to: number; first: number; last: number; double: boolean }[] = [];
  const closeStacks = (y: number) => {
    stacks = stacks.filter((st) => {
      if (y - st.last <= o.lineGap) return true;
      const band = st.last + 1 - st.first;
      if (st.double && band <= o.maxBand) found.push({ from: st.from, to: st.to, a: st.first, b: st.last + 1, between: "lines" });
      return false;
    });
  };
  for (let y = 0; y <= wall.h; y++) {
    const row: Candidate[] = [];
    if (y < wall.h) {
      const runs = rowRuns(wall, y);
      for (let i = 0; i + 1 < runs.length; i++) {
        const A = runs[i]!;
        const B = runs[i + 1]!;
        const len = B.start - A.end;
        if (len < 2) continue;
        // Measured a few pixels into the wall: the anti-aliased edge column has broken runs.
        let leftAcross = 0;
        let rightAcross = 0;
        for (let k = 1; k <= Math.min(3, A.end - A.start); k++) leftAcross = Math.max(leftAcross, across[y * wall.w + A.end - k]!);
        for (let k = 0; k < Math.min(3, B.end - B.start); k++) rightAcross = Math.max(rightAcross, across[y * wall.w + B.start + k]!);
        const leftEnd = leftAcross <= o.maxBand;
        const rightEnd = rightAcross <= o.maxBand;
        if (!leftEnd && !rightEnd) {
          if (len > o.maxWindow) continue;
          let lined = 0;
          for (let x = A.end; x < B.start; x++) lined += ink.data[y * wall.w + x]!;
          if (lined < len * 0.85) continue;
          const st = stacks.find((q) => Math.abs(q.from - A.end) <= 2 && Math.abs(q.to - B.start) <= 2);
          if (st) {
            if (y - st.last > 1) st.double = true;
            st.last = y;
          } else stacks.push({ from: A.end, to: B.start, first: y, last: y, double: false });
          continue;
        }
        const ok = (leftEnd && rightEnd && len <= o.maxWindow) || ((leftEnd || rightEnd) && len <= o.maxDoor);
        if (!ok) continue;
        let inner = 0;
        for (let x = A.end; x < B.start; x++) inner += inside.data[y * wall.w + x]!;
        if (inner < len * 0.9) continue;
        row.push({ at: y, from: A.end, to: B.start, between: leftEnd && rightEnd ? "walls" : "corner", leftEnd, rightEnd });
      }
    }
    closeStacks(y < wall.h ? y : Infinity);
    const next: Band[] = [];
    for (const c of row) {
      // Compare with the previous row only, so anti-aliasing noise cannot drift a band apart.
      const prev = active.find((p) => Math.abs(p.from - c.from) <= 2 && Math.abs(p.to - c.to) <= 2);
      if (prev) {
        next.push({
          ...c,
          a: prev.a,
          froms: [...prev.froms, c.from],
          tos: [...prev.tos, c.to],
          leftEnd: prev.leftEnd && c.leftEnd,
          rightEnd: prev.rightEnd && c.rightEnd,
          between: prev.leftEnd && c.leftEnd && prev.rightEnd && c.rightEnd ? "walls" : "corner",
        });
        active = active.filter((p) => p !== prev);
      } else next.push({ ...c, a: y, froms: [c.from], tos: [c.to] });
    }
    for (const p of active) {
      const band = p.at + 1 - p.a;
      if (band < o.minBand || band > o.maxBand) continue;
      const from = median(p.froms);
      const to = median(p.tos);
      // A wall tip fills exactly the band: just beyond the band, next to the tip, there is no wall.
      const free = (t: number) => {
        let n = 0;
        for (const s of [p.a - 2, p.at + 2]) if (s >= 0 && s < wall.h && t >= 0 && t < wall.w && !wall.data[s * wall.w + t]) n++;
        return n === 2;
      };
      if (p.leftEnd && !free(from - 2)) continue;
      if (p.rightEnd && !free(to + 1)) continue;
      found.push({ from, to, a: p.a, b: p.at + 1, between: p.between });
    }
    active = next;
  }
  return found;
}

type Frame = { at: (t: number, s: number) => number; w: number; h: number };

function frameFor(axis: Opening["axis"], m: { w: number; h: number }): Frame {
  // (t, s): t runs along the wall, s across it.
  return axis === "h"
    ? { at: (t, s) => (s < 0 || t < 0 || s >= m.h || t >= m.w ? -1 : s * m.w + t), w: m.w, h: m.h }
    : { at: (t, s) => (s < 0 || t < 0 || s >= m.w || t >= m.h ? -1 : t * m.w + s), w: m.w, h: m.h };
}

function inkNear(ink: Mask, f: Frame, t: number, s: number, r: number) {
  for (let ds = -r; ds <= r; ds++) {
    for (let dt = -r; dt <= r; dt++) {
      const p = f.at(Math.round(t + dt), Math.round(s + ds));
      if (p >= 0 && ink.data[p]) return true;
    }
  }
  return false;
}

/** A quarter-circle door swing next to the gap, or frame or threshold lines across it. */
function symbolIn(op: Omit<Opening, "where" | "symbol">, model: WallModel): Opening["symbol"] {
  const f = frameFor(op.axis, model);
  const len = op.to - op.from;
  // A door leaf is a line at right angles to the wall, starting at the wall face; the swing is a quarter
  // circle from its tip back to the wall. Hinges are not always at the end of the gap (fixed side panels).
  for (const side of [-1, 1] as const) {
    const face = side === 1 ? op.b : op.a - 1;
    for (let t = op.from - 2; t <= op.to + 2; t++) {
      let leaf = 0;
      while (leaf <= len * 1.2 && inkNear(model.ink, f, t, face + side * (leaf + 1), 1)) leaf++;
      if (leaf < Math.max(10, len * 0.3) || leaf > len * 1.2) continue;
      for (const dir of [-1, 1] as const) {
        // Rays from the hinge towards the wall: each should cross the swing at about the leaf length
        // (drawn swings are not always exact circles).
        let hit = 0;
        let total = 0;
        for (let deg = 20; deg <= 75; deg += 5) {
          const th = (deg * Math.PI) / 180;
          total++;
          for (let r = leaf * 0.8; r <= leaf * 1.35; r += 1) {
            if (inkNear(model.ink, f, t + dir * r * Math.sin(th), face + side * r * Math.cos(th), 1)) {
              hit++;
              break;
            }
          }
        }
        if (hit >= total * 0.75) return "draaicirkel";
      }
    }
  }
  // Checked after the swing: glass doors have frame lines too, windows never have a swing.
  for (let s = op.a - 1; s <= op.b; s++) {
    let covered = 0;
    for (let t = op.from; t < op.to; t++) if (inkNear(model.ink, f, t, s, 0)) covered++;
    if (covered >= len * 0.8) return "lijnen";
  }
  return "geen";
}

/** Share of the gap whose first non-wall pixel beyond the band (direction `dir`) lies inside the building. */
function sideInside(op: Omit<Opening, "where" | "symbol">, model: WallModel, dir: 1 | -1) {
  const f = frameFor(op.axis, model);
  const start = dir === 1 ? op.b : op.a - 1;
  const reach = Math.ceil(model.thick * 2) + 4;
  let n = 0;
  for (let t = op.from; t < op.to; t++) {
    for (let k = 2; k <= reach; k++) {
      const p = f.at(t, start + dir * k);
      if (p < 0) break;
      if (model.wall.data[p]) continue;
      if (model.inside.data[p] && !model.outside.data[p]) n++;
      break;
    }
  }
  return n / Math.max(1, op.to - op.from);
}

/**
 * Finds door and window openings: gaps in a wall band, bounded by wall on both sides (a gap in a straight
 * wall) or by a wall end facing another wall (a door next to a corner). Inside the house a gap only counts
 * when a door is drawn in it (threshold lines or a swing): a wall that simply stops is an open connection,
 * not a door. Wider passages are never closed, so open-plan spaces stay connected.
 */
export function findOpenings(model: WallModel, maxDoorPx: number, maxWindowPx: number): { openings: Opening[]; bridge: Mask } {
  const opts = {
    maxDoor: maxDoorPx,
    maxWindow: maxWindowPx,
    minBand: Math.max(2, Math.round(model.thin * 0.5)),
    maxBand: Math.round(model.thick * 1.6) + 2,
    lineGap: Math.max(6, Math.round(model.thin)),
  };
  const candidates = [
    ...openingsAlongRows(model.wall, model.inside, model.ink, opts).map((f) => ({ axis: "h" as const, ...f })),
    ...openingsAlongRows(transpose(model.wall), transpose(model.inside), transpose(model.ink), opts).map((f) => ({
      axis: "v" as const,
      ...f,
    })),
  ];
  const openings: Opening[] = [];
  for (const c of candidates) {
    // Look a few pixels beyond the band: right next to it are anti-aliased edge pixels.
    const facade = Math.min(sideInside(c, model, -1), sideInside(c, model, 1)) < 0.5;
    const symbol = symbolIn(c, model);
    if (!facade && symbol === "geen") continue;
    if (!facade && c.between !== "lines" && c.to - c.from > maxDoorPx) continue;
    openings.push({ ...c, where: facade ? "gevel" : "binnen", symbol });
  }
  const bridge = emptyMask(model.w, model.h);
  for (const op of openings) {
    for (let s = op.a; s < op.b; s++) {
      for (let t = op.from; t < op.to; t++) {
        const p = op.axis === "h" ? s * model.w + t : t * model.w + s;
        bridge.data[p] = 1;
      }
    }
  }
  return { openings, bridge };
}
