/**
 * Small, dependency-free raster toolkit for reading floor plans: binary masks, exact Euclidean distance
 * transforms (Felzenszwalb & Huttenlocher), morphology by distance, connected components and exact
 * outline tracing. Everything is deterministic and runs in the browser and in Node.
 */

export type Mask = { w: number; h: number; data: Uint8Array };

export function emptyMask(w: number, h: number): Mask {
  return { w, h, data: new Uint8Array(w * h) };
}

/** Dark pixels of an RGBA image (canvas ImageData) become 1. */
export function inkFromRgba(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, level = 140): Mask {
  const out = emptyMask(w, h);
  for (let i = 0, p = 0; i < out.data.length; i++, p += 4) {
    const a = rgba[p + 3]! / 255;
    // Transparent pixels count as white paper.
    const lum = (0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!) * a + 255 * (1 - a);
    out.data[i] = lum < level ? 1 : 0;
  }
  return out;
}

export function count(m: Mask) {
  let n = 0;
  for (let i = 0; i < m.data.length; i++) n += m.data[i]!;
  return n;
}

const INF = 1e20;

/** 1D squared distance transform of sampled function f (Felzenszwalb & Huttenlocher). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    d[q] = (q - v[k]!) * (q - v[k]!) + f[v[k]!]!;
  }
}

/** Euclidean distance from every pixel to the nearest pixel whose mask value equals `target`. */
export function distanceTo(m: Mask, target: 0 | 1): Float32Array {
  const { w, h, data } = m;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const grid = new Float64Array(w * h);
  for (let i = 0; i < grid.length; i++) grid[i] = data[i] === target ? 0 : INF;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x]!;
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y]!;
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x]!;
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]!);
  }
  return out;
}

export function dilate(m: Mask, r: number): Mask {
  const dist = distanceTo(m, 1);
  const out = emptyMask(m.w, m.h);
  for (let i = 0; i < dist.length; i++) out.data[i] = dist[i]! <= r ? 1 : 0;
  return out;
}

export function erode(m: Mask, r: number): Mask {
  const dist = distanceTo(m, 0);
  const out = emptyMask(m.w, m.h);
  for (let i = 0; i < dist.length; i++) out.data[i] = dist[i]! > r ? 1 : 0;
  return out;
}

/** Removes strokes thinner than 2r while keeping thicker shapes at their original size. */
export function open(m: Mask, r: number): Mask {
  const kept = dilate(erode(m, r), r + 0.5);
  for (let i = 0; i < kept.data.length; i++) kept.data[i] = kept.data[i]! & m.data[i]!;
  return kept;
}

/** 4-connected components of pixels with value `target`. Labels start at 1; 0 means "other value". */
export function components(m: Mask, target: 0 | 1 = 1): { labels: Int32Array; count: number; sizes: number[] } {
  const { w, h, data } = m;
  const labels = new Int32Array(w * h);
  const sizes = [0];
  const stack = new Int32Array(w * h);
  let next = 0;
  for (let start = 0; start < data.length; start++) {
    if (data[start] !== target || labels[start]) continue;
    next++;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    labels[start] = next;
    while (top) {
      const p = stack[--top]!;
      size++;
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0 && data[p - 1] === target && !labels[p - 1]) ((labels[p - 1] = next), (stack[top++] = p - 1));
      if (x < w - 1 && data[p + 1] === target && !labels[p + 1]) ((labels[p + 1] = next), (stack[top++] = p + 1));
      if (y > 0 && data[p - w] === target && !labels[p - w]) ((labels[p - w] = next), (stack[top++] = p - w));
      if (y < h - 1 && data[p + w] === target && !labels[p + w]) ((labels[p + w] = next), (stack[top++] = p + w));
    }
    sizes.push(size);
  }
  return { labels, count: next, sizes };
}

export type Pt = { x: number; y: number };

/**
 * Traces the outer outline of one labelled region along pixel edges ("crack following"), keeping the region
 * on the right. Returns the corner points where the direction changes, in pixel-corner coordinates.
 */
export function traceOutline(labels: Int32Array, w: number, h: number, id: number): Pt[] {
  let start = -1;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === id) {
      start = i;
      break;
    }
  }
  if (start < 0) return [];
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === id;
  const sx = start % w;
  const sy = (start - sx) / w;
  // Directions clockwise in screen coordinates: east, south, west, north.
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  let x = sx + 1;
  let y = sy;
  let dir = 0;
  const pts: Pt[] = [{ x: sx, y: sy }];
  const limit = 4 * (w + 1) * (h + 1);
  for (let steps = 0; steps < limit; steps++) {
    // Pixels ahead-left and ahead-right of the corner (x, y) for the current direction.
    let fl: boolean;
    let fr: boolean;
    if (dir === 0) ((fr = inside(x, y)), (fl = inside(x, y - 1)));
    else if (dir === 1) ((fr = inside(x - 1, y)), (fl = inside(x, y)));
    else if (dir === 2) ((fr = inside(x - 1, y - 1)), (fl = inside(x - 1, y)));
    else ((fr = inside(x, y - 1)), (fl = inside(x - 1, y - 1)));
    let nd = dir;
    if (fl && fr)
      nd = (dir + 3) % 4; // turn left
    else if (!fr) nd = (dir + 1) % 4; // turn right
    if (nd !== dir) pts.push({ x, y });
    dir = nd;
    x += DX[dir]!;
    y += DY[dir]!;
    if (x === sx && y === sy) break;
  }
  return pts;
}

function perpDistance(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Ramer–Douglas–Peucker on an open polyline. */
function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  let max = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDistance(pts[i]!, pts[0]!, pts[pts.length - 1]!);
    if (d > max) ((max = d), (idx = i));
  }
  if (max <= eps) return [pts[0]!, pts[pts.length - 1]!];
  const left = rdp(pts.slice(0, idx + 1), eps);
  const right = rdp(pts.slice(idx), eps);
  return [...left.slice(0, -1), ...right];
}

/** RDP for a closed polygon: split at the point farthest from the first vertex. */
export function simplifyClosed(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 4) return pts.slice();
  let far = 0;
  let best = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i]!.x - pts[0]!.x, pts[i]!.y - pts[0]!.y);
    if (d > best) ((best = d), (far = i));
  }
  const a = rdp(pts.slice(0, far + 1), eps);
  const b = rdp([...pts.slice(far), pts[0]!], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/**
 * Turns a simplified outline into a clean polygon: nearly horizontal/vertical edges are snapped to exact
 * lines, consecutive parallel edges are merged and corners are recomputed as line intersections.
 */
export function orthogonalize(pts: Pt[], minEdge: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  type Edge = { kind: "h" | "v" | "d"; a: Pt; b: Pt; c: number };
  let edges: Edge[] = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dy <= dx * 0.14) return { kind: "h", a, b, c: (a.y + b.y) / 2 };
    if (dx <= dy * 0.14) return { kind: "v", a, b, c: (a.x + b.x) / 2 };
    return { kind: "d", a, b, c: 0 };
  });
  // Merge runs of same-orientation edges whose lines are close (removes 1-pixel jogs).
  let changed = true;
  while (changed && edges.length > 3) {
    changed = false;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i]!;
      const f = edges[(i + 1) % edges.length]!;
      const g = edges[(i + 2) % edges.length]!;
      // Pattern: long edge, tiny jog, long edge on (almost) the same line → one edge.
      if (e.kind !== "d" && e.kind === g.kind && Math.abs(e.c - g.c) <= minEdge && Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y) <= minEdge) {
        const le = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
        const lg = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
        const merged: Edge = { kind: e.kind, a: e.a, b: g.b, c: (e.c * le + g.c * lg) / (le + lg) };
        const j = (i + 1) % edges.length;
        const k = (i + 2) % edges.length;
        edges = edges.filter((_, idx) => idx !== j && idx !== k);
        edges.splice(edges.indexOf(e), 1, merged);
        changed = true;
        break;
      }
      if (e.kind !== "d" && e.kind === f.kind && Math.abs(e.c - f.c) <= minEdge) {
        const le = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
        const lf = Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y);
        const merged: Edge = { kind: e.kind, a: e.a, b: f.b, c: (e.c * le + f.c * lf) / (le + lf || 1) };
        const j = (i + 1) % edges.length;
        edges = edges.filter((_, idx) => idx !== j);
        edges.splice(edges.indexOf(e), 1, merged);
        changed = true;
        break;
      }
    }
  }
  const out: Pt[] = [];
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!;
    const f = edges[(i + 1) % edges.length]!;
    if (e.kind === "h" && f.kind === "v") out.push({ x: f.c, y: e.c });
    else if (e.kind === "v" && f.kind === "h") out.push({ x: e.c, y: f.c });
    else if (e.kind === "h") out.push({ x: e.b.x, y: e.c });
    else if (e.kind === "v") out.push({ x: e.c, y: e.b.y });
    else if (f.kind === "h") out.push({ x: e.b.x, y: f.c });
    else if (f.kind === "v") out.push({ x: f.c, y: e.b.y });
    else out.push(e.b);
  }
  // Drop duplicate and collinear points.
  const clean: Pt[] = [];
  for (const p of out) {
    const last = clean[clean.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) clean.push(p);
  }
  if (clean.length > 1 && Math.hypot(clean[0]!.x - clean[clean.length - 1]!.x, clean[0]!.y - clean[clean.length - 1]!.y) < 1e-6)
    clean.pop();
  const result: Pt[] = [];
  for (let i = 0; i < clean.length; i++) {
    const a = clean[(i - 1 + clean.length) % clean.length]!;
    const b = clean[i]!;
    const c = clean[(i + 1) % clean.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 1e-6) result.push(b);
  }
  return result;
}

/** Pixels whose brightest channel is at most `level`: black and near-black ink, but not coloured fills. */
export function darkFromRgba(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, level: number): Mask {
  const out = emptyMask(w, h);
  for (let i = 0, p = 0; i < out.data.length; i++, p += 4) {
    if (rgba[p + 3]! < 128) continue;
    out.data[i] = Math.max(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!) <= level ? 1 : 0;
  }
  return out;
}

/** Blank paper: (nearly) white or transparent pixels. */
export function paperFromRgba(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, level = 235): Mask {
  const out = emptyMask(w, h);
  for (let i = 0, p = 0; i < out.data.length; i++, p += 4) {
    out.data[i] = rgba[p + 3]! < 128 || Math.min(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!) >= level ? 1 : 0;
  }
  return out;
}

export function and(a: Mask, b: Mask): Mask {
  const out = emptyMask(a.w, a.h);
  for (let i = 0; i < out.data.length; i++) out.data[i] = a.data[i]! & b.data[i]!;
  return out;
}

export function or(a: Mask, b: Mask): Mask {
  const out = emptyMask(a.w, a.h);
  for (let i = 0; i < out.data.length; i++) out.data[i] = a.data[i]! | b.data[i]!;
  return out;
}

export function not(a: Mask): Mask {
  const out = emptyMask(a.w, a.h);
  for (let i = 0; i < out.data.length; i++) out.data[i] = a.data[i]! ? 0 : 1;
  return out;
}

/** Fills gaps narrower than 2r between shapes; shapes keep their outer size. */
export function close(m: Mask, r: number): Mask {
  return erode(dilate(m, r + 0.5), r + 0.5);
}

/** Pixels of `passable` connected (4-neighbourhood) to the image border. */
export function reachableFromBorder(passable: Mask): Mask {
  const { w, h, data } = passable;
  const out = emptyMask(w, h);
  const stack = new Int32Array(w * h);
  let top = 0;
  const push = (p: number) => {
    if (data[p] && !out.data[p]) {
      out.data[p] = 1;
      stack[top++] = p;
    }
  };
  for (let x = 0; x < w; x++) (push(x), push((h - 1) * w + x));
  for (let y = 0; y < h; y++) (push(y * w), push(y * w + w - 1));
  while (top) {
    const p = stack[--top]!;
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  return out;
}

/** The shape with all enclosed holes filled. */
export function fillHoles(m: Mask): Mask {
  return not(reachableFromBorder(not(m)));
}

export function transpose(m: Mask): Mask {
  const out = emptyMask(m.h, m.w);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) out.data[x * m.h + y] = m.data[y * m.w + x]!;
  return out;
}

export type Run = { start: number; end: number };

/** Runs of 1-pixels in one row, as half-open intervals. */
export function rowRuns(m: Mask, y: number): Run[] {
  const runs: Run[] = [];
  const base = y * m.w;
  let x = 0;
  while (x < m.w) {
    while (x < m.w && !m.data[base + x]) x++;
    if (x >= m.w) break;
    const start = x;
    while (x < m.w && m.data[base + x]) x++;
    runs.push({ start, end: x });
  }
  return runs;
}

export type Bounds = { x0: number; y0: number; x1: number; y1: number };

/** Bounding boxes (inclusive pixel coordinates) of labelled components; index = label. */
export function componentBounds(labels: Int32Array, w: number, count: number): Bounds[] {
  const b: Bounds[] = [{ x0: 0, y0: 0, x1: -1, y1: -1 }];
  for (let i = 1; i <= count; i++) b.push({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  for (let p = 0; p < labels.length; p++) {
    const id = labels[p]!;
    if (!id) continue;
    const x = p % w;
    const y = (p - x) / w;
    const bb = b[id]!;
    if (x < bb.x0) bb.x0 = x;
    if (x > bb.x1) bb.x1 = x;
    if (y < bb.y0) bb.y0 = y;
    if (y > bb.y1) bb.y1 = y;
  }
  return b;
}

/** Sliding maximum over a window of 2r+1 along one axis (van Herk/Gil-Werman style, O(n)). */
function slidingMax(src: Float32Array, w: number, h: number, r: number, vertical: boolean): Float32Array {
  const out = new Float32Array(src.length);
  const n = vertical ? h : w;
  const lines = vertical ? w : h;
  const at = (line: number, i: number) => (vertical ? i * w + line : line * w + i);
  const size = 2 * r + 1;
  const left = new Float32Array(n + size);
  const right = new Float32Array(n + size);
  for (let line = 0; line < lines; line++) {
    // Pad with -Infinity so windows at the edges only see real pixels.
    const val = (i: number) => (i < 0 || i >= n ? -Infinity : src[at(line, i)]!);
    const total = n + 2 * r;
    for (let i = 0; i < total; i++) {
      const v = val(i - r);
      left[i] = i % size === 0 ? v : Math.max(left[i - 1]!, v);
    }
    for (let i = total - 1; i >= 0; i--) {
      const v = val(i - r);
      right[i] = i === total - 1 || (i + 1) % size === 0 ? v : Math.max(right[i + 1]!, v);
    }
    for (let i = 0; i < n; i++) out[at(line, i)] = Math.max(right[i]!, left[i + 2 * r]!);
  }
  return out;
}

/**
 * Prepares a page for OCR: divides every pixel by the brightest value around it, so coloured room fills
 * become white while dark text keeps its contrast. Tesseract binarises the whole page at once and loses
 * labels on darker fills (a blue bathroom) otherwise. Large dark areas (walls) stay dark.
 */
export function flattenBackground(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, r = 8): Uint8ClampedArray {
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    const a = rgba[p + 3]! / 255;
    lum[i] = (0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!) * a + 255 * (1 - a);
  }
  const bg = slidingMax(slidingMax(lum, w, h, r, false), w, h, r, true);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    const v = bg[i]! < 40 ? lum[i]! : Math.min(255, (lum[i]! / bg[i]!) * 255);
    out[p] = out[p + 1] = out[p + 2] = v;
    out[p + 3] = 255;
  }
  return out;
}
