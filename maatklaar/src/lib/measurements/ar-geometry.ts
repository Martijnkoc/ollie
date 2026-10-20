import { AR_MEASURE } from "@/config/scantag";

/**
 * Geometry of AR measuring points: positions in metres in the WebXR session's reference space, lengths and
 * their uncertainty in millimetres. Pure functions, the same on the device and on the server.
 */
export type Vec3 = { x: number; y: number; z: number };

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const norm = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
export const midpoint = (a: Vec3, b: Vec3) => scale(add(a, b), 0.5);
/** Distance in millimetres between two points given in metres. */
export const distMm = (a: Vec3, b: Vec3) => norm(sub(a, b)) * 1000;

export function unit(a: Vec3): Vec3 | null {
  const n = norm(a);
  return n > 1e-12 ? scale(a, 1 / n) : null;
}

export type Plane = { origin: Vec3; normal: Vec3; /** Largest distance of a point from the plane, mm. */ residualMm: number };

/** Best plane through a polygon (Newell's normal through the centroid); null for points on a line. */
export function planeOf(points: readonly Vec3[]): Plane | null {
  if (points.length < 3) return null;
  let n: Vec3 = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    n = add(n, { x: (a.y - b.y) * (a.z + b.z), y: (a.z - b.z) * (a.x + b.x), z: (a.x - b.x) * (a.y + b.y) });
  }
  const normal = unit(n);
  if (!normal) return null;
  const origin = scale(
    points.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 }),
    1 / points.length,
  );
  const residualMm = Math.max(...points.map((p) => Math.abs(dot(sub(p, origin), normal)) * 1000));
  return { origin, normal, residualMm };
}

export function projectOnPlane(p: Vec3, plane: Plane): Vec3 {
  return sub(p, scale(plane.normal, dot(sub(p, plane.origin), plane.normal)));
}

/** Angle at b between b→a and b→c, in degrees. */
export function angleDeg(a: Vec3, b: Vec3, c: Vec3) {
  const u = unit(sub(a, b));
  const v = unit(sub(c, b));
  if (!u || !v) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180) / Math.PI;
}

/** A captured point: its mean position, how much it moved over the frames and how far away it was. */
export type PointQuality = { spreadMm: number; rangeM: number };

/** One-sigma error of a point (mm): its own jitter and the assumed tracking error at its distance. */
export function pointSigmaMm(p: PointQuality) {
  return Math.hypot(p.spreadMm, AR_MEASURE.baseSigmaMm + AR_MEASURE.sigmaPerMetreMm * p.rangeM);
}

/**
 * A length with its margin. `mm` is the raw value, never rounded here. `randomMm` (~95 %, two sigma) shrinks
 * with repeated scans; `systematicMm` (the scale share of the tracking) does not. The margin is their sum.
 */
export type ScanValue = { mm: number; randomMm: number; systematicMm: number; uncertaintyMm: number };

export function lengthValue(mm: number, sigmas: readonly number[]): ScanValue {
  const randomMm = 2 * Math.hypot(...sigmas);
  const systematicMm = (mm * AR_MEASURE.scalePercent) / 100;
  return { mm, randomMm, systematicMm, uncertaintyMm: randomMm + systematicMm };
}

/** The smallest margin this sensor could give for a length, with both points as close as tracking allows. */
export function bestCaseUncertaintyMm(mm: number) {
  const sigma = AR_MEASURE.baseSigmaMm + AR_MEASURE.sigmaPerMetreMm * AR_MEASURE.closestRangeM;
  return lengthValue(mm, [sigma, sigma]).uncertaintyMm;
}

export type Combined = ScanValue & {
  shots: number;
  /** Largest difference between the scans. */
  spreadMm: number;
  /** Every pair of scans agrees within their combined random margin. */
  agree: boolean;
};

/**
 * The same length from several scans. The mean counts only when they agree; the random part shrinks with more
 * scans but never below half their spread, the systematic part does not shrink.
 */
export function combine(list: readonly ScanValue[]): Combined | null {
  if (!list.length) return null;
  const n = list.length;
  const mm = list.reduce((s, v) => s + v.mm, 0) / n;
  const values = list.map((v) => v.mm);
  const spreadMm = Math.max(...values) - Math.min(...values);
  let agree = true;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (Math.abs(list[i]!.mm - list[j]!.mm) > Math.hypot(list[i]!.randomMm, list[j]!.randomMm)) agree = false;
  const randomMm = Math.max(Math.sqrt(list.reduce((s, v) => s + v.randomMm ** 2, 0)) / n, spreadMm / 2);
  const systematicMm = list.reduce((s, v) => s + v.systematicMm, 0) / n;
  return { mm, randomMm, systematicMm, uncertaintyMm: randomMm + systematicMm, shots: n, spreadMm, agree };
}
