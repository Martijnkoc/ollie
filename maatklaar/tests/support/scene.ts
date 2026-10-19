import type { Gray } from "@/lib/measurements/edges";
import { project, type Pt } from "@/lib/measurements/photo";

/**
 * A synthetic grey photo of a flat scene: rectangles in millimetres on a wall, projected with a camera
 * homography, anti-aliased by supersampling, softened like a lens and with sensor noise. Drawn in order,
 * later rectangles on top.
 */
export function renderScene(opts: {
  h: readonly number[];
  w: number;
  height: number;
  background: number;
  rects: { x0: number; y0: number; x1: number; y1: number; value: number }[];
  noise?: number;
  seed?: number;
}): Gray {
  const { w, height } = opts;
  const data = new Float32Array(w * height).fill(opts.background);
  const sub = 3;
  for (const r of opts.rects) {
    const quad: Pt[] = [
      { x: r.x0, y: r.y0 },
      { x: r.x1, y: r.y0 },
      { x: r.x1, y: r.y1 },
      { x: r.x0, y: r.y1 },
    ].map((p) => project(opts.h, p));
    const inside = (x: number, y: number) => {
      let sign = 0;
      for (let i = 0; i < 4; i++) {
        const a = quad[i]!;
        const b = quad[(i + 1) % 4]!;
        const z = Math.sign((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x));
        if (z === 0) continue;
        if (sign === 0) sign = z;
        else if (z !== sign) return false;
      }
      return true;
    };
    const xs = quad.map((p) => p.x);
    const ys = quad.map((p) => p.y);
    const minX = Math.max(0, Math.floor(Math.min(...xs)) - 1);
    const maxX = Math.min(w - 1, Math.ceil(Math.max(...xs)) + 1);
    const minY = Math.max(0, Math.floor(Math.min(...ys)) - 1);
    const maxY = Math.min(height - 1, Math.ceil(Math.max(...ys)) + 1);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        let hits = 0;
        // Pixel (x, y) covers [x, x+1) × [y, y+1); its centre is at (x + 0.5, y + 0.5).
        for (let sy = 0; sy < sub; sy++) for (let sx = 0; sx < sub; sx++) if (inside(x + (sx + 0.5) / sub, y + (sy + 0.5) / sub)) hits++;
        if (hits) {
          const f = hits / (sub * sub);
          data[y * w + x] = data[y * w + x]! * (1 - f) + r.value * f;
        }
      }
    }
  }
  // Lens softness: a 3 × 3 box blur, twice.
  let src = data;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(w * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= height) continue;
            s += src[yy * w + xx]!;
            n++;
          }
        out[y * w + x] = s / n;
      }
    src = out;
  }
  let seed = opts.seed ?? 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const noise = opts.noise ?? 3;
  const bytes = new Uint8Array(w * height);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.max(0, Math.min(255, Math.round(src[i]! + rnd() * noise)));
  return { w, h: height, data: bytes };
}
