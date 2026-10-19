import { dist, type Marked, type Pt } from "./photo";

/**
 * Sub-pixel corners from the edges in a photo. A finger tap is good to a few pixels; the straight edges of an
 * A4 sheet or a window opening are good to a fraction of a pixel when fitted over their whole length. Each
 * side of a tapped quadrilateral is searched for the edge nearest to the tap, a line is fitted to it, and
 * neighbouring lines are intersected. A side without a clear edge keeps the tapped corners: snapping never
 * invents an edge that is not there.
 */
export type Gray = { w: number; h: number; data: ArrayLike<number> };

export function grayFromRgba(rgba: ArrayLike<number>, w: number, h: number): Gray {
  const data = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) data[i] = (rgba[j]! * 77 + rgba[j + 1]! * 150 + rgba[j + 2]! * 29) >> 8;
  return { w, h, data };
}

/** Bilinear brightness at a photo coordinate; pixel i covers [i, i + 1), so its centre is at i + 0.5. */
function sample(g: Gray, x: number, y: number) {
  const fx = Math.min(g.w - 1.001, Math.max(0, x - 0.5));
  const fy = Math.min(g.h - 1.001, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const dx = fx - x0;
  const dy = fy - y0;
  const i = y0 * g.w + x0;
  const d = g.data;
  return (d[i]! * (1 - dx) + d[i + 1]! * dx) * (1 - dy) + (d[i + g.w]! * (1 - dx) + d[i + g.w + 1]! * dx) * dy;
}

type Line = { p: Pt; d: Pt };
export type EdgeFit = { line: Line; rms: number; n: number; samples: number; tSpread: number; tMean: number };

/** Total least squares line through points; `t` is each point's position along the line. */
function fitLine(points: readonly Pt[]): { line: Line; residuals: number[]; t: number[] } {
  const n = points.length;
  const cx = points.reduce((s, p) => s + p.x, 0) / n;
  const cy = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - cx) ** 2;
    sxy += (p.x - cx) * (p.y - cy);
    syy += (p.y - cy) ** 2;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const d = { x: Math.cos(angle), y: Math.sin(angle) };
  const residuals = points.map((p) => -(p.x - cx) * d.y + (p.y - cy) * d.x);
  const t = points.map((p) => (p.x - cx) * d.x + (p.y - cy) * d.y);
  return { line: { p: { x: cx, y: cy }, d }, residuals, t };
}

/**
 * Finds the straight edge running from near `a` to near `b`. Profiles across the side are searched within
 * `searchPx`; per profile the strongest change of brightness nearest to the tapped side counts, with the
 * polarity most profiles agree on (the sheet is lighter than its background on every side).
 */
export function findEdge(g: Gray, a: Pt, b: Pt, searchPx: number): EdgeFit | null {
  const len = dist(a, b);
  if (len < 16) return null;
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const nrm = { x: -d.y, y: d.x };
  const count = Math.max(12, Math.min(120, Math.round(len / 4)));
  const found: { p: Pt; sign: number }[] = [];
  const steps = Math.round(searchPx * 2);
  for (let i = 0; i < count; i++) {
    const t = (0.12 + (0.76 * i) / (count - 1)) * len;
    const c = { x: a.x + d.x * t, y: a.y + d.y * t };
    // Brightness across the side, averaged over three parallel rows against JPEG noise.
    const at = (s: number) => {
      let v = 0;
      for (const o of [-1.5, 0, 1.5]) v += sample(g, c.x + nrm.x * s + d.x * o, c.y + nrm.y * s + d.y * o);
      return v / 3;
    };
    const grad: number[] = [];
    for (let k = -steps; k <= steps; k++) grad.push(at(k / 2 + 0.5) - at(k / 2 - 0.5));
    let max = 0;
    for (const v of grad) max = Math.max(max, Math.abs(v));
    if (max < 4) continue;
    let best = -1;
    for (let k = 1; k < grad.length - 1; k++) {
      const v = Math.abs(grad[k]!);
      if (v < max * 0.5 || v < Math.abs(grad[k - 1]!) || v < Math.abs(grad[k + 1]!)) continue;
      if (best < 0 || Math.abs(k - steps) < Math.abs(best - steps)) best = k;
    }
    if (best < 0) continue;
    const y0 = Math.abs(grad[best - 1]!);
    const y1 = Math.abs(grad[best]!);
    const y2 = Math.abs(grad[best + 1]!);
    const denom = y0 - 2 * y1 + y2;
    const offset = denom < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom)) : 0;
    const s = (best - steps + offset) / 2;
    found.push({ p: { x: c.x + nrm.x * s, y: c.y + nrm.y * s }, sign: Math.sign(grad[best]!) });
  }
  if (found.length < 8) return null;
  const plus = found.filter((f) => f.sign > 0).length;
  let pts = found.filter((f) => (plus * 2 >= found.length ? f.sign > 0 : f.sign < 0)).map((f) => f.p);

  let fit = fitLine(pts);
  for (let round = 0; round < 4; round++) {
    const rms = Math.sqrt(fit.residuals.reduce((s, r) => s + r * r, 0) / fit.residuals.length);
    const keep = pts.filter((_, i) => Math.abs(fit.residuals[i]!) <= Math.max(0.75, 2.5 * rms));
    if (keep.length === pts.length) break;
    pts = keep;
    if (pts.length < 8) return null;
    fit = fitLine(pts);
  }
  if (pts.length < Math.max(8, count * 0.4)) return null;
  // The fitted edge must run along the tapped side, not across it.
  if (Math.abs(fit.line.d.x * d.x + fit.line.d.y * d.y) < Math.cos((10 * Math.PI) / 180)) return null;
  const rms = Math.sqrt(fit.residuals.reduce((s, r) => s + r * r, 0) / fit.residuals.length);
  const tMean = fit.t.reduce((s, v) => s + v, 0) / fit.t.length;
  const tSpread = fit.t.reduce((s, v) => s + (v - tMean) ** 2, 0);
  return { line: fit.line, rms, n: pts.length, samples: count, tSpread, tMean };
}

function intersect(l1: Line, l2: Line): Pt | null {
  const det = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
  if (Math.abs(det) < 1e-6) return null;
  const s = ((l2.p.x - l1.p.x) * l2.d.y - (l2.p.y - l1.p.y) * l2.d.x) / det;
  return { x: l1.p.x + l1.d.x * s, y: l1.p.y + l1.d.y * s };
}

/** 1σ distance of a fitted line from the true edge at point `q`, from the fit residuals and the leverage. */
function lineSigma(fit: EdgeFit, q: Pt) {
  const t = (q.x - fit.line.p.x) * fit.line.d.x + (q.y - fit.line.p.y) * fit.line.d.y;
  // A floor of 0.15 px per sample for blur and JPEG blocks that the residuals do not show.
  const rms = Math.max(fit.rms, 0.15);
  return rms * Math.sqrt(1 / fit.n + (t - fit.tMean) ** 2 / Math.max(fit.tSpread, 1e-6));
}

export function defaultSearchPx(g: { w: number; h: number }) {
  return Math.max(6, Math.min(20, Math.round(Math.max(g.w, g.h) * 0.005)));
}

/**
 * Refines the corners of a quadrilateral (top-left, top-right, bottom-right, bottom-left) to the edges in
 * the photo. A corner moves only when both of its sides have a clear edge and the intersection stays
 * within reach of the tap; otherwise it keeps the tapped position and uncertainty.
 */
export function refineQuad(g: Gray, quad: readonly Marked[], searchPx = defaultSearchPx(g)): { corners: Marked[]; refined: boolean[] } {
  const sides = quad.map((p, i) => findEdge(g, p, quad[(i + 1) % 4]!, searchPx));
  const corners: Marked[] = [];
  const refined: boolean[] = [];
  for (let k = 0; k < 4; k++) {
    const before = sides[(k + 3) % 4];
    const after = sides[k];
    const tap = quad[k]!;
    const at = before && after ? intersect(before.line, after.line) : null;
    if (!at || dist(at, tap) > searchPx * 1.5) {
      corners.push(tap);
      refined.push(false);
      continue;
    }
    const s1 = lineSigma(before!, at);
    const s2 = lineSigma(after!, at);
    const sin = Math.abs(before!.line.d.x * after!.line.d.y - before!.line.d.y * after!.line.d.x);
    corners.push({ ...at, sigma: Math.max(0.1, Math.hypot(s1, s2) / Math.max(sin, 0.2)) });
    refined.push(true);
  }
  return { corners, refined };
}
