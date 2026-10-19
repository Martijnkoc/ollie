import { CAMERA_MEASURE } from "@/config/site";
import type { Gray } from "@/lib/measurements/edges";
import { dist, type Pt } from "@/lib/measurements/photo";

/**
 * Photo checks for a ScanTag shot, on the device: is the reference large and sharp enough, is the photo
 * taken from the front, is the opening washed out by glare. Deterministic image measures with fixed
 * thresholds; a failed blocking check means "extra opname nodig", never a quietly worse measurement.
 * The thresholds are starting values to be tuned in the physical validation (docs/METROLOGIE.md).
 */
export const QUALITY_LIMITS = {
  /** Edge width (10–90 % rise, px) relative to the reference's shorter side: above this the photo is blurred. */
  maxEdgeWidthShare: 0.04,
  /** Ratio of opposite sides of a reference in the photo: below this the photo was taken too much at an angle. */
  minSideRatio: 0.6,
  /** Share of saturated pixels in the measured area that counts as glare when its corners found no edge. */
  maxGlareShare: 0.15,
};

export type QualityIssue = { blocking: boolean; text: string };

function sample(g: Gray, x: number, y: number) {
  const xi = Math.max(0, Math.min(g.w - 1, Math.round(x - 0.5)));
  const yi = Math.max(0, Math.min(g.h - 1, Math.round(y - 0.5)));
  return g.data[yi * g.w + xi]!;
}

/** Median 10–90 % rise distance of the edges along a quadrilateral, in pixels; null without clear edges. */
export function edgeWidth(g: Gray, quad: readonly Pt[]): number | null {
  const widths: number[] = [];
  for (let s = 0; s < 4; s++) {
    const a = quad[s]!;
    const b = quad[(s + 1) % 4]!;
    const len = dist(a, b);
    if (len < 20) continue;
    const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const n = { x: -d.y, y: d.x };
    for (let i = 1; i <= 8; i++) {
      const t = (0.2 + (0.6 * i) / 9) * len;
      const c = { x: a.x + d.x * t, y: a.y + d.y * t };
      const reach = Math.max(8, Math.round(len * 0.06));
      const profile: number[] = [];
      for (let k = -reach; k <= reach; k++) profile.push(sample(g, c.x + n.x * k, c.y + n.y * k));
      const lo = Math.min(...profile);
      const hi = Math.max(...profile);
      if (hi - lo < 25) continue;
      const rising = profile[profile.length - 1]! > profile[0]!;
      const p = rising ? profile : [...profile].reverse();
      const at = (f: number) => p.findIndex((v) => v >= lo + f * (hi - lo));
      const w = at(0.9) - at(0.1);
      if (w > 0) widths.push(w);
    }
  }
  if (widths.length < 6) return null;
  widths.sort((x, y) => x - y);
  return widths[Math.floor(widths.length / 2)]!;
}

/** Share of near-white pixels inside a quadrilateral (sampled on a grid). */
export function saturatedShare(g: Gray, quad: readonly Pt[]): number {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
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
  let n = 0;
  let hot = 0;
  const stepX = (Math.max(...xs) - Math.min(...xs)) / 40;
  const stepY = (Math.max(...ys) - Math.min(...ys)) / 40;
  for (let y = Math.min(...ys); y <= Math.max(...ys); y += stepY || 1)
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += stepX || 1) {
      if (!inside(x, y)) continue;
      n++;
      if (sample(g, x, y) >= 250) hot++;
    }
  return n ? hot / n : 0;
}

/**
 * Checks one shot. `references` are the reference quadrilaterals, `measured` the measured rectangle (if the
 * task has one) and `snapped` whether its corners found edges.
 */
export function checkShot(g: Gray | null, references: Pt[][], measured: Pt[] | null, measuredSnapped: boolean): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const [i, q] of references.entries()) {
    const sides = q.map((p, k) => dist(p, q[(k + 1) % 4]!));
    const short = Math.min(...sides);
    const name = references.length > 1 ? `Vel ${i + 1}` : "De referentie";
    if (short < CAMERA_MEASURE.minReferencePx)
      issues.push({ blocking: true, text: `${name} is te klein in beeld. Kom dichterbij of zoom niet uit.` });
    const ratio = Math.min(sides[0]! / sides[2]!, sides[2]! / sides[0]!, sides[1]! / sides[3]!, sides[3]! / sides[1]!);
    if (ratio < QUALITY_LIMITS.minSideRatio)
      issues.push({ blocking: true, text: `${name} staat erg schuin in beeld. Ga meer recht voor het raam staan.` });
    if (g) {
      const w = edgeWidth(g, q);
      if (w !== null && w > Math.max(3, short * QUALITY_LIMITS.maxEdgeWidthShare))
        issues.push({
          blocking: true,
          text: `De foto is onscherp of bewogen rond ${name.toLowerCase()}. Houd je telefoon stil en maak een nieuwe foto.`,
        });
    }
  }
  if (g && measured && !measuredSnapped && saturatedShare(g, measured) > QUALITY_LIMITS.maxGlareShare)
    issues.push({
      blocking: false,
      text: "Veel tegenlicht of schittering in de opening: de randen zijn moeilijk te zien. Fotografeer liever zonder zon op het glas.",
    });
  return issues;
}

/** Device type and browser family for debugging and per-device validation; no identifiers. */
export function captureContext(method: "camera-app" | "browser-camera" | "upload"): {
  method: "camera-app" | "browser-camera" | "upload";
  device: "mobiel" | "desktop" | "onbekend";
  browser: string;
} {
  if (typeof navigator === "undefined") return { method, device: "onbekend", browser: "" };
  const ua = navigator.userAgent;
  const match = /(Edg|OPR|SamsungBrowser|Firefox|CriOS|Chrome|Version)\/(\d+)/.exec(ua);
  const family = match
    ? (({ Edg: "Edge", OPR: "Opera", CriOS: "Chrome", Version: "Safari" } as Record<string, string>)[match[1]!] ?? match[1]!)
    : "onbekend";
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return { method, device: coarse ? "mobiel" : "desktop", browser: match ? `${family} ${match[2]}` : family };
}
