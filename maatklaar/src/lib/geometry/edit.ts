import { area, signedArea, type Point } from "./polygon";

/**
 * Exact editing of room outlines: splitting a room along a line the user draws, and joining two rooms that
 * share a boundary (for example after a split, or an open kitchen that should count as one room).
 */

const EPS = 1e-6;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const same = (a: Point, b: Point, eps: number) => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;

function inside(pt: Point, poly: readonly Point[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Removes repeated points and points on a straight line between their neighbours. */
export function cleanPolygon(points: readonly Point[], eps = EPS): Point[] {
  let pts = points.filter((p, i) => !same(p, points[(i + 1) % points.length]!, eps));
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length]!;
      const b = pts[i]!;
      const c = pts[(i + 1) % pts.length]!;
      const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      if (Math.abs(cross(sub(b, a), sub(c, a))) / len <= eps) {
        pts = pts.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

export type SplitResult = { ok: true; parts: [Point[], Point[]] } | { ok: false; reason: string };

/**
 * Splits a room outline along the line through `a` and `b`. The cut runs between the room's walls on both
 * sides of the drawn line's middle, so a short line inside the room is enough. Works for L-shapes too, as
 * long as the cut itself stays inside the room.
 */
export function splitPolygon(points: readonly Point[], a: Point, b: Point): SplitResult {
  const dir = sub(b, a);
  const len2 = dir.x * dir.x + dir.y * dir.y;
  if (points.length < 3 || len2 === 0) return { ok: false, reason: "Teken een lijn met twee verschillende punten." };
  type Hit = { edge: number; t: number; u: number; p: Point };
  const hits: Hit[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const e = sub(points[(i + 1) % points.length]!, p);
    const denom = cross(dir, e);
    if (Math.abs(denom) < EPS) continue;
    const t = -cross(dir, sub(p, a)) / denom;
    if (t < 0 || t >= 1) continue;
    const q = { x: p.x + e.x * t, y: p.y + e.y * t };
    hits.push({ edge: i, t, u: ((q.x - a.x) * dir.x + (q.y - a.y) * dir.y) / len2, p: q });
  }
  const before = hits.filter((h) => h.u <= 0.5).sort((x, y) => y.u - x.u)[0];
  const after = hits.filter((h) => h.u >= 0.5).sort((x, y) => x.u - y.u)[0];
  if (!before || !after || before.edge === after.edge)
    return { ok: false, reason: "De lijn moet de ruimte van wand tot wand doorkruisen. Teken hem binnen de ruimte." };
  const mid = { x: (before.p.x + after.p.x) / 2, y: (before.p.y + after.p.y) / 2 };
  if (!inside(mid, points)) return { ok: false, reason: "De lijn loopt buiten de ruimte. Teken hem binnen de ruimte." };

  const n = points.length;
  const walk = (from: Hit, to: Hit) => {
    const out: Point[] = [from.p];
    for (let i = (from.edge + 1) % n; ; i = (i + 1) % n) {
      out.push(points[i]!);
      if (i === to.edge) break;
    }
    out.push(to.p);
    return cleanPolygon(out);
  };
  const first = walk(before, after);
  const second = walk(after, before);
  const total = area(points);
  if (first.length < 3 || second.length < 3 || area(first) < total * 0.01 || area(second) < total * 0.01)
    return { ok: false, reason: "Een van de delen wordt te klein. Teken de lijn verder binnen de ruimte." };
  return { ok: true, parts: [first, second] };
}

export type MergeResult = { ok: true; polygon: Point[] } | { ok: false; reason: string };

/**
 * Joins two outlines that share (a stretch of) one boundary edge. Rooms with a wall between them do not
 * touch on the drawing and are not joined: that would count the wall as floor.
 */
export function mergePolygons(p: readonly Point[], q: readonly Point[], eps = 1e-3): MergeResult {
  // Same winding for both, so a shared edge runs in opposite directions.
  const P = signedArea(p) < 0 ? [...p].reverse() : [...p];
  const Q = signedArea(q) < 0 ? [...q].reverse() : [...q];
  for (let i = 0; i < P.length; i++) {
    for (let j = 0; j < Q.length; j++) {
      const a = P[i]!;
      const b = P[(i + 1) % P.length]!;
      if (!same(a, Q[(j + 1) % Q.length]!, eps) || !same(b, Q[j]!, eps)) continue;
      const out: Point[] = [];
      for (let k = 0; k < P.length; k++) out.push(P[(i + 1 + k) % P.length]!);
      for (let k = 2; k < Q.length; k++) out.push(Q[(j + k) % Q.length]!);
      const merged = cleanPolygon(out, eps);
      if (Math.abs(area(merged) - area(P) - area(Q)) > (area(P) + area(Q)) * 1e-6)
        return { ok: false, reason: "Deze ruimtes overlappen; samenvoegen zou vloer dubbel tellen." };
      return { ok: true, polygon: merged };
    }
  }
  return {
    ok: false,
    reason:
      "Deze ruimtes delen geen grens op de tekening (er staat een wand tussen). Alleen aangrenzende ruimtes zonder wand kunnen samen.",
  };
}

/** Index of the edge in `next` that lies on edge `edge` of `prev` (for moving doors and plinth choices along). */
export function mapEdge(prev: readonly Point[], edge: number, next: readonly Point[], eps = 1e-3): number {
  const a = prev[edge]!;
  const b = prev[(edge + 1) % prev.length]!;
  const d = sub(b, a);
  const len = Math.hypot(d.x, d.y);
  if (!len) return -1;
  const onLine = (p: Point) => Math.abs(cross(d, sub(p, a))) / len <= eps * Math.max(1, len);
  let best = -1;
  let bestOverlap = 0;
  for (let j = 0; j < next.length; j++) {
    const c = next[j]!;
    const e = next[(j + 1) % next.length]!;
    if (!onLine(c) || !onLine(e)) continue;
    const t = (p: Point) => ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / len;
    const overlap = Math.min(len, Math.max(t(c), t(e))) - Math.max(0, Math.min(t(c), t(e)));
    if (overlap > bestOverlap) ((best = j), (bestOverlap = overlap));
  }
  return best;
}
