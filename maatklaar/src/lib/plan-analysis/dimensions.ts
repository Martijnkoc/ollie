import { parseSingleLength } from "./classify";
import { and, componentBounds, components, not, transpose, type Bounds, type Mask } from "./raster";
import type { WallModel } from "./walls";

/**
 * Dimension lines outside the building: a thin line with short ticks at the measured points and the
 * value written in a gap of the line ("|—— 5.45 m ——|") or just above it. Their pixel length together with
 * the value gives the scale of the drawing, independently of any paper size or scale notation.
 */
export type DimensionLine = {
  /** "h": a horizontal line (measures along x); "v": a vertical line (measures along y). */
  axis: "h" | "v";
  /** Row (h) or column (v) of the line, in analysis pixels. */
  at: number;
  /** Measured stretch between the ticks, along the line, in pixel-corner coordinates. */
  from: number;
  to: number;
  /** Box around the written value. */
  label: Bounds;
};

type Found = { at: number; from: number; to: number; label: Bounds };

const width = (b: Bounds) => b.x1 - b.x0 + 1;
const height = (b: Bounds) => b.y1 - b.y0 + 1;

/** Tick columns inside one line component: columns where it is clearly taller than the line itself. */
function ticksOf(labels: Int32Array, w: number, id: number, b: Bounds) {
  const counts: number[] = [];
  for (let x = b.x0; x <= b.x1; x++) {
    let n = 0;
    for (let y = b.y0; y <= b.y1; y++) if (labels[y * w + x] === id) n++;
    counts.push(n);
  }
  const line = [...counts].sort((p, q) => p - q)[counts.length >> 1]!;
  // The row of the line: where most of its pixels are.
  const rows = new Map<number, number>();
  for (let y = b.y0; y <= b.y1; y++) {
    let n = 0;
    for (let x = b.x0; x <= b.x1; x++) if (labels[y * w + x] === id) n++;
    rows.set(y, n);
  }
  const at = [...rows.entries()].sort((p, q) => q[1] - p[1])[0]![0];
  const ticks: number[] = [];
  let start = -1;
  for (let i = 0; i <= counts.length; i++) {
    const tall = i < counts.length && counts[i]! >= Math.max(5, line * 2.5);
    if (tall && start < 0) start = i;
    if (!tall && start >= 0) {
      ticks.push(b.x0 + (start + i) / 2);
      start = -1;
    }
  }
  return { at, ticks };
}

/** Finds dimension lines whose labels read along +x in this mask (lines horizontal). */
function detectRows(m: Mask): Found[] {
  const long = Math.max(m.w, m.h);
  const { labels, count } = components(m, 1);
  const bounds = componentBounds(labels, m.w, count);
  const minLine = Math.max(12, long * 0.008);
  const maxLineH = Math.max(14, long * 0.012);
  const gMin = Math.max(6, long * 0.005);
  const gMax = long * 0.03;

  const lines: { id: number; b: Bounds }[] = [];
  const glyphs: Bounds[] = [];
  for (let id = 1; id <= count; id++) {
    const b = bounds[id]!;
    const bw = width(b);
    const bh = height(b);
    if (bw >= minLine && bh <= maxLineH && bw >= bh * 3) lines.push({ id, b });
    else if (bh >= gMin && bh <= gMax && bw <= bh * 1.8) glyphs.push(b);
  }

  // Glyphs on one baseline and close together form one label ("5.45 m").
  glyphs.sort((p, q) => p.x0 - q.x0);
  const words: Bounds[] = [];
  const used = new Uint8Array(glyphs.length);
  for (let i = 0; i < glyphs.length; i++) {
    if (used[i]) continue;
    const word = { ...glyphs[i]! };
    used[i] = 1;
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < glyphs.length; j++) {
        if (used[j]) continue;
        const g = glyphs[j]!;
        const hh = Math.max(height(word), height(g));
        const overlap = Math.min(word.y1, g.y1) - Math.max(word.y0, g.y0) + 1;
        const gap = g.x0 > word.x1 ? g.x0 - word.x1 : word.x0 > g.x1 ? word.x0 - g.x1 : 0;
        if (overlap >= Math.min(height(word), height(g)) * 0.5 && gap <= hh * 0.9) {
          word.x0 = Math.min(word.x0, g.x0);
          word.x1 = Math.max(word.x1, g.x1);
          word.y0 = Math.min(word.y0, g.y0);
          word.y1 = Math.max(word.y1, g.y1);
          used[j] = 1;
          grew = true;
        }
      }
    }
    // A label has at least two glyphs ("1 m" is too short to be useful anyway).
    if (width(word) >= height(word) * 1.5) words.push(word);
  }

  const tickCache = new Map<number, ReturnType<typeof ticksOf>>();
  const ticks = (l: { id: number; b: Bounds }) => {
    let t = tickCache.get(l.id);
    if (!t) tickCache.set(l.id, (t = ticksOf(labels, m.w, l.id, l.b)));
    return t;
  };

  const found: Found[] = [];
  for (const word of words) {
    const hw = height(word);
    const cy = (word.y0 + word.y1) / 2;
    const cx = (word.x0 + word.x1 + 1) / 2;
    // Style 1: the value sits in a gap of the line.
    const left = lines
      .filter((l) => l.b.x1 < word.x0 && word.x0 - l.b.x1 <= hw * 1.5 && Math.abs(ticks(l).at - cy) <= hw * 0.35)
      .sort((p, q) => q.b.x1 - p.b.x1)[0];
    const right = lines
      .filter((l) => l.b.x0 > word.x1 && l.b.x0 - word.x1 <= hw * 1.5 && Math.abs(ticks(l).at - cy) <= hw * 0.35)
      .sort((p, q) => p.b.x0 - q.b.x0)[0];
    let from: number | null = null;
    let to: number | null = null;
    let at = 0;
    if (left && right) {
      const lt = ticks(left).ticks.filter((t) => t <= word.x0);
      const rt = ticks(right).ticks.filter((t) => t >= word.x1);
      from = lt.length ? lt[lt.length - 1]! : left.b.x0;
      to = rt.length ? rt[0]! : right.b.x1 + 1;
      at = (ticks(left).at + ticks(right).at) / 2;
    } else {
      // Style 2: the value is written just above or below a continuous line.
      const under = lines
        .filter((l) => l.b.x0 < word.x0 && l.b.x1 > word.x1)
        .map((l) => ({ l, d: Math.min(Math.abs(ticks(l).at - word.y1), Math.abs(ticks(l).at - word.y0)) }))
        .filter((c) => c.d <= hw * 0.8)
        .sort((p, q) => p.d - q.d)[0];
      if (under) {
        const t = ticks(under.l).ticks;
        const lt = t.filter((x) => x <= cx);
        const rt = t.filter((x) => x >= cx);
        from = lt.length ? lt[lt.length - 1]! : under.l.b.x0;
        to = rt.length ? rt[0]! : under.l.b.x1 + 1;
        at = ticks(under.l).at;
      }
    }
    if (from === null || to === null || to - from < hw * 1.5) continue;
    if (Math.abs((from + to) / 2 - cx) > (to - from) * 0.15 + hw) continue;
    found.push({ at, from, to, label: word });
  }
  return found;
}

/** All dimension lines around the building, horizontal and vertical. */
export function findDimensionLines(model: WallModel): DimensionLine[] {
  const ink = and(model.ink, not(model.inside));
  const rows = detectRows(ink).map((f) => ({ axis: "h" as const, ...f }));
  const cols = detectRows(transpose(ink)).map((f) => ({
    axis: "v" as const,
    at: f.at,
    from: f.from,
    to: f.to,
    label: { x0: f.label.y0, y0: f.label.x0, x1: f.label.y1, y1: f.label.x1 },
  }));
  return [...rows, ...cols];
}

export type Raster = { data: Uint8Array | Uint8ClampedArray; w: number; h: number };

/**
 * Cuts a label out of the page for OCR: grey, padded with white and enlarged, and turned upright.
 * Vertical labels on Dutch plans usually read bottom-to-top, which needs a quarter turn clockwise (90).
 */
export function cropForOcr(page: Raster, box: Bounds, rotate: 0 | 90 | 270, scale = 3): Raster {
  const bw = width(box);
  const bh = height(box);
  const pad = Math.round(Math.min(bw, bh) * 0.6);
  const sw = bw + 2 * pad;
  const sh = bh + 2 * pad;
  const lum = (x: number, y: number) => {
    const px = box.x0 - pad + x;
    const py = box.y0 - pad + y;
    if (x < pad || y < pad || x >= sw - pad || y >= sh - pad || px < 0 || py < 0 || px >= page.w || py >= page.h) return 255;
    const p = (py * page.w + px) * 4;
    const a = page.data[p + 3]! / 255;
    return (0.299 * page.data[p]! + 0.587 * page.data[p + 1]! + 0.114 * page.data[p + 2]!) * a + 255 * (1 - a);
  };
  // Source size after rotation.
  const rw = rotate === 0 ? sw : sh;
  const rh = rotate === 0 ? sh : sw;
  const src = (x: number, y: number) => (rotate === 0 ? lum(x, y) : rotate === 90 ? lum(y, sh - 1 - x) : lum(sw - 1 - y, x));
  const ow = Math.round(rw * scale);
  const oh = Math.round(rh * scale);
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    const fy = Math.min(rh - 1, Math.max(0, (y + 0.5) / scale - 0.5));
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let x = 0; x < ow; x++) {
      const fx = Math.min(rw - 1, Math.max(0, (x + 0.5) / scale - 0.5));
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const x1 = Math.min(rw - 1, x0 + 1);
      const y1 = Math.min(rh - 1, y0 + 1);
      const v = (src(x0, y0) * (1 - tx) + src(x1, y0) * tx) * (1 - ty) + (src(x0, y1) * (1 - tx) + src(x1, y1) * tx) * ty;
      const p = (y * ow + x) * 4;
      out[p] = out[p + 1] = out[p + 2] = v;
      out[p + 3] = 255;
    }
  }
  return { data: out, w: ow, h: oh };
}

/**
 * Where a decimal separator sits in a label, from the shapes alone: the number of tall glyphs before a
 * small blob on the baseline. OCR engines regularly drop that dot ("5.45 m" → "545m"); we only put it
 * back when the drawing shows exactly one dot and as many glyphs as characters read.
 */
export function decimalPosition(crop: Raster, characters: number): number | null {
  const ink: Mask = { w: crop.w, h: crop.h, data: new Uint8Array(crop.w * crop.h) };
  for (let i = 0; i < ink.data.length; i++) ink.data[i] = crop.data[i * 4]! < 128 ? 1 : 0;
  const { labels, count } = components(ink, 1);
  const parts = componentBounds(labels, crop.w, count).slice(1);
  if (!parts.length) return null;
  const maxH = Math.max(...parts.map(height));
  const tall = parts.filter((b) => height(b) >= maxH * 0.55).sort((a, b) => a.x0 - b.x0);
  if (tall.length !== characters) return null;
  const base = Math.max(...tall.map((b) => b.y1));
  const dots = parts.filter((b) => height(b) <= maxH * 0.3 && width(b) <= maxH * 0.35 && b.y1 >= base - maxH * 0.2);
  if (dots.length !== 1) return null;
  const dx = (dots[0]!.x0 + dots[0]!.x1) / 2;
  const before = tall.filter((b) => (b.x0 + b.x1) / 2 < dx).length;
  return before > 0 && before < tall.length ? before : null;
}

/**
 * Reads the value of a dimension label. Accepts "5.45 m", "5,45", "545" (cm) and the like through the
 * same unit rules as the rest of the analysis; with the label image at hand, a dropped decimal point is
 * restored only when the shapes show exactly where it is.
 */
export function readDimensionText(raw: string, crop?: Raster): { mm: number; text: string } | null {
  const text = raw
    .toLowerCase()
    .replace(/rn/g, "m")
    .replace(/[^0-9.,cm]/g, "");
  const direct = parseSingleLength(text);
  if (direct?.mm) return { mm: direct.mm, text };
  const lost = /^(\d{2,4})m$/.exec(text);
  if (lost && crop) {
    const digits = lost[1]!;
    const at = decimalPosition(crop, digits.length + 1);
    if (at !== null && at < digits.length) {
      const fixed = `${digits.slice(0, at)}.${digits.slice(at)} m`;
      const parsed = parseSingleLength(fixed);
      if (parsed?.mm) return { mm: parsed.mm, text: fixed.replace(" ", "") };
    }
  }
  return null;
}

export type DimensionReading = DimensionLine & { mm: number; text: string };

export type ScaleConsensus = {
  /** Millimetres per analysis pixel. */
  mmPerPx: number;
  /** Readings that agree with each other. */
  inliers: DimensionReading[];
  /** Readings that do not fit (misread or measured to another point). */
  outliers: DimensionReading[];
  /** Half-width of the agreement, as a fraction of the scale (0.004 = ±0,4 %). */
  uncertainty: number;
  /** Rounding step of the values on the drawing, in mm (Zibber-style plans round to 50 mm). */
  stepMm: number;
};

/**
 * The scale most dimension lines agree on. Each reading allows a range of scales: its value can be off by
 * half the rounding step used on the drawing, the line ends by a pixel or two. The scale covered by the most
 * ranges wins; it needs at least two agreeing lines and must explain the majority of them.
 */
export function scaleConsensus(readings: readonly DimensionReading[]): ScaleConsensus | null {
  const usable = readings.filter((r) => r.to - r.from >= 10);
  if (usable.length < 2) return null;
  const stepMm = usable.every((r) => r.mm % 50 === 0) ? 50 : usable.every((r) => r.mm % 10 === 0) ? 10 : 1;
  const ranges = usable.map((r) => {
    const px = r.to - r.from;
    return { r, lo: (r.mm - stepMm / 2) / (px + 2), hi: (r.mm + stepMm / 2) / Math.max(1, px - 2) };
  });
  const events = ranges.flatMap((x) => [
    { v: x.lo, d: 1 },
    { v: x.hi, d: -1 },
  ]);
  events.sort((a, b) => a.v - b.v || b.d - a.d);
  let depth = 0;
  let best = 0;
  let at = 0;
  for (let i = 0; i < events.length; i++) {
    depth += events[i]!.d;
    if (depth > best) {
      best = depth;
      at = (events[i]!.v + events[i + 1]!.v) / 2;
    }
  }
  const agree = ranges.filter((x) => x.lo <= at && x.hi >= at);
  if (agree.length < 2 || agree.length * 2 < usable.length) return null;
  const inliers = agree.map((x) => x.r);
  const mmPerPx = inliers.reduce((s, r) => s + r.mm, 0) / inliers.reduce((s, r) => s + (r.to - r.from), 0);
  const lo = Math.max(...agree.map((x) => x.lo));
  const hi = Math.min(...agree.map((x) => x.hi));
  return {
    mmPerPx,
    inliers,
    outliers: usable.filter((r) => !inliers.includes(r)),
    uncertainty: Math.max(Math.abs(hi - mmPerPx), Math.abs(mmPerPx - lo)) / mmPerPx,
    stepMm,
  };
}
