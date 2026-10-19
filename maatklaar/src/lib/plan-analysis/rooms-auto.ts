import {
  and,
  distanceTo,
  componentBounds,
  components,
  not,
  orthogonalize,
  simplifyClosed,
  traceOutline,
  type Bounds,
  type Mask,
  type Pt,
} from "./raster";
import type { WallModel } from "./walls";

/** A room name found on the plan, positioned in analysis pixels. */
export type PlacedLabel = { name: string; x: number; y: number; h: number };

export type RoomRegion = {
  /**
   * Room names inside this space, in reading order. Empty: a closed space without a name. Several: an open
   * space that carries more than one name (woonkamer + keuken) without a clear place to divide it.
   */
  names: string[];
  pixels: number;
  bounds: Bounds;
  /** Outline in analysis pixels (pixel-corner coordinates), clockwise on screen. */
  polygon: Pt[];
  /** Share of the outline that runs along a wall or a door/window opening. */
  wallShare: number;
  /** True when the outline had to be kept as traced (not cleanly rectangular). */
  irregular: boolean;
  /** Names of spaces this one flows into without a wall; the boundary with them is estimated. */
  openTo: string[];
};

export function polygonArea(pts: Pt[]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** The labelled pixel closest to (x, y) within radius r, or -1. */
function nearestFree(labels: Int32Array, w: number, h: number, x: number, y: number, r: number) {
  const cx = Math.round(x);
  const cy = Math.round(y);
  let best = -1;
  let bestD = Infinity;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const d = dx * dx + dy * dy;
      if (labels[py * w + px] && d < bestD) ((best = py * w + px), (bestD = d));
    }
  }
  return best;
}

/** Max-heap of pixels by depth, as buckets of half a pixel. */
function bucketQueue(depth: Float32Array) {
  const buckets: number[][] = [];
  let top = -1;
  return {
    push(p: number) {
      const q = Math.round(depth[p]! * 2);
      (buckets[q] ??= []).push(p);
      if (q > top) top = q;
    },
    pop(): number | undefined {
      while (top >= 0) {
        const p = buckets[top]?.pop();
        if (p !== undefined) return p;
        top--;
      }
      return undefined;
    },
  };
}

function neighbours(p: number, w: number, n: number) {
  const x = p % w;
  return [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p + w < n ? p + w : -1];
}

/**
 * Width of the narrowest place on the widest route between two points of one space (as depth: distance to
 * the nearest wall). Grows from `a` through the deepest pixels first; the shallowest step taken before
 * reaching `b` is the bottleneck.
 */
function bottleneck(labels: Int32Array, w: number, id: number, a: number, b: number, depth: Float32Array) {
  const seen = new Uint8Array(labels.length);
  const queue = bucketQueue(depth);
  let low = Infinity;
  seen[a] = 1;
  queue.push(a);
  for (let p = queue.pop(); p !== undefined; p = queue.pop()) {
    low = Math.min(low, depth[p]!);
    if (p === b) return low;
    for (const q of neighbours(p, w, labels.length)) {
      if (q < 0 || seen[q] || labels[q] !== id) continue;
      seen[q] = 1;
      queue.push(q);
    }
  }
  return 0;
}

function localDepth(depth: Float32Array, w: number, p: number, r: number) {
  const x0 = p % w;
  const y0 = (p - x0) / w;
  let best = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const q = (y0 + dy) * w + x0 + dx;
      if (q >= 0 && q < depth.length && depth[q]! > best) best = depth[q]!;
    }
  }
  return best;
}

/**
 * Divides one open space with several names. Names are only separated where the space clearly narrows
 * between them (a doorway without a door drawn): each side then grows from its label through the deepest
 * pixels first, so the fronts meet in the narrow place. Without such a narrowing (open-plan living and
 * kitchen) the names stay together as one room: a boundary there would be a guess.
 */
function divideByNames(labels: Int32Array, w: number, id: number, seeds: number[], depth: Float32Array, nextId: number): number[][] {
  const parent = seeds.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      const neck = bottleneck(labels, w, id, seeds[i]!, seeds[j]!, depth);
      const own = Math.min(localDepth(depth, w, seeds[i]!, 6), localDepth(depth, w, seeds[j]!, 6));
      if (neck > own * 0.6) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  seeds.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const result = [...groups.values()];
  if (result.length === 1) return result;

  const owner = new Int32Array(labels.length);
  const queue = bucketQueue(depth);
  result.forEach((members, g) => {
    for (const i of members) {
      owner[seeds[i]!] = nextId + g;
      queue.push(seeds[i]!);
    }
  });
  for (let p = queue.pop(); p !== undefined; p = queue.pop()) {
    for (const q of neighbours(p, w, labels.length)) {
      if (q < 0 || labels[q] !== id || owner[q]) continue;
      owner[q] = owner[p]!;
      queue.push(q);
    }
  }
  for (let p = 0; p < labels.length; p++) if (owner[p]) labels[p] = owner[p]!;
  return result;
}

/**
 * Splits the building into closed spaces: everything inside the outer walls that is not wall, not a door or
 * window opening and not blank paper outside. Furniture, fills and text do not split a room.
 */
export function segmentRooms(
  model: WallModel,
  bridge: Mask,
  placed: readonly PlacedLabel[],
  o: { minAreaPx: number; maxAreaPx: number },
): RoomRegion[] {
  const { w, h } = model;
  const free = and(and(model.inside, not(model.wall)), and(not(bridge), not(model.outside)));
  const { labels, count, sizes } = components(free, 1);
  const bounds = componentBounds(labels, w, count);

  const names = new Map<number, { label: PlacedLabel; seed: number }[]>();
  for (const label of placed) {
    const seed = nearestFree(labels, w, h, label.x, label.y, Math.ceil(label.h));
    if (seed < 0) continue;
    const id = labels[seed]!;
    const list = names.get(id) ?? [];
    if (!list.some((l) => l.label.name === label.name)) list.push({ label, seed });
    names.set(id, list);
  }

  // Outline contact with walls and openings, per space.
  const wallSide = new Float64Array(count + 1);
  const otherSide = new Float64Array(count + 1);
  for (let p = 0; p < labels.length; p++) {
    const id = labels[p]!;
    if (!id) continue;
    const x = p % w;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < w * (h - 1) ? p + w : -1]) {
      if (q < 0) {
        otherSide[id]!++;
        continue;
      }
      if (labels[q] === id) continue;
      if (model.wall.data[q] || bridge.data[q]) wallSide[id]!++;
      else otherSide[id]!++;
    }
  }

  type Part = { id: number; names: string[]; pixels: number; bounds: Bounds; wallShare: number; openTo: string[] };
  const parts: Part[] = [];
  let depth: Float32Array | null = null;
  let nextId = count + 1;
  for (let id = 1; id <= count; id++) {
    const size = sizes[id]!;
    const b = bounds[id]!;
    const named = (names.get(id) ?? []).sort((p, q) => p.label.y - q.label.y || p.label.x - q.label.x);
    const wallShare = wallSide[id]! / Math.max(1, wallSide[id]! + otherSide[id]!);
    const touchesEdge = b.x0 === 0 || b.y0 === 0 || b.x1 === w - 1 || b.y1 === h - 1;
    if (touchesEdge || size > o.maxAreaPx) continue;
    if (named.length === 0 && (size < o.minAreaPx || wallShare < 0.7)) continue;
    if (named.length > 0 && size < o.minAreaPx * 0.25) continue;
    if (named.length < 2) {
      parts.push({ id, names: named.map((n) => n.label.name), pixels: size, bounds: b, wallShare, openTo: [] });
      continue;
    }
    depth ??= distanceTo(free, 0);
    const groups = divideByNames(
      labels,
      w,
      id,
      named.map((n) => n.seed),
      depth,
      nextId,
    );
    if (groups.length === 1) {
      parts.push({ id, names: named.map((n) => n.label.name), pixels: size, bounds: b, wallShare, openTo: [] });
      continue;
    }
    const ids = groups.map((_, g) => nextId + g);
    nextId += groups.length;
    const sub = componentBounds(labels, w, nextId - 1);
    const subSizes = new Map<number, number>();
    for (let p = 0; p < labels.length; p++) if (labels[p]! >= ids[0]!) subSizes.set(labels[p]!, (subSizes.get(labels[p]!) ?? 0) + 1);
    groups.forEach((members, g) => {
      const own = members.map((i) => named[i]!.label.name);
      parts.push({
        id: ids[g]!,
        names: own,
        pixels: subSizes.get(ids[g]!) ?? 0,
        bounds: sub[ids[g]!]!,
        wallShare,
        openTo: named.map((n) => n.label.name).filter((n) => !own.includes(n)),
      });
    });
  }

  const out: RoomRegion[] = [];
  for (const part of parts) {
    if (!part.pixels) continue;
    const traced = traceOutline(labels, w, h, part.id);
    const simple = simplifyClosed(traced, 1.0);
    const ortho = orthogonalize(simple, Math.max(2, model.thin * 0.5));
    const fits = (pts: Pt[]) => pts.length >= 3 && Math.abs(polygonArea(pts) - part.pixels) <= part.pixels * 0.03;
    const irregular = !fits(ortho);
    const polygon = irregular ? simple : ortho;
    if (!fits(polygon)) continue;
    out.push({
      names: part.names,
      pixels: part.pixels,
      bounds: part.bounds,
      polygon,
      wallShare: part.wallShare,
      irregular,
      openTo: part.openTo,
    });
  }
  return out;
}

/** Reading order: top to bottom, then left to right. */
export function sortRegions(regions: RoomRegion[]) {
  return [...regions].sort((a, b) => a.bounds.y0 - b.bounds.y0 || a.bounds.x0 - b.bounds.x0);
}
