import type { Vec3 } from "@/lib/measurements/ar-geometry";
import type { ScanInput, ScanPoint } from "@/lib/measurements/scan";

/**
 * Synthetic AR scans with a known truth: a wall plane somewhere in the session space (turned and tilted, as a
 * phone's reference space is), points given in millimetres on that wall, the phone at a given distance.
 * Software tests only: they prove the geometry and the checks, not how accurate a real phone is.
 */
export type Wall = { origin: Vec3; right: Vec3; up: Vec3; normal: Vec3 };

/** A wall turned `yawDeg` around the vertical and `rollDeg` within its own plane, `distanceM` in front of the phone. */
export function wall(distanceM = 1.8, yawDeg = 25, rollDeg = 3): Wall {
  const y = (yawDeg * Math.PI) / 180;
  const r = (rollDeg * Math.PI) / 180;
  const baseRight = { x: Math.cos(y), y: 0, z: Math.sin(y) };
  const baseUp = { x: 0, y: 1, z: 0 };
  const right = {
    x: baseRight.x * Math.cos(r) + baseUp.x * Math.sin(r),
    y: baseRight.y * Math.cos(r) + Math.sin(r),
    z: baseRight.z * Math.cos(r),
  };
  const up = { x: -baseRight.x * Math.sin(r), y: Math.cos(r), z: -baseRight.z * Math.sin(r) };
  const normal = { x: -Math.sin(y), y: 0, z: Math.cos(y) };
  return { origin: { x: -0.4, y: 0.2, z: -distanceM }, right, up, normal };
}

/** A point on (or `outMm` in front of) the wall, from wall millimetres (x to the right, y down). */
export function on(w: Wall, xMm: number, yMm: number, outMm = 0): Vec3 {
  const x = xMm / 1000;
  const y = -yMm / 1000;
  const o = outMm / 1000;
  return {
    x: w.origin.x + w.right.x * x + w.up.x * y + w.normal.x * o,
    y: w.origin.y + w.right.y * x + w.up.y * y + w.normal.y * o,
    z: w.origin.z + w.right.z * x + w.up.z * y + w.normal.z * o,
  };
}

export function point(p: Vec3, opts: Partial<Omit<ScanPoint, "p">> = {}): ScanPoint {
  const rangeM = Math.hypot(p.x, p.y, p.z);
  return { p, n: null, spreadMm: 1, frames: 20, rangeM, depthDiffMm: null, ...opts };
}

export const DEVICE: ScanInput["device"] = {
  webxr: true,
  hitTest: true,
  depthSensing: false,
  domOverlay: true,
  platform: "android",
  browser: "Chrome 141",
};

/** The four corners (top-left, top-right, bottom-right, bottom-left) of an opening on the wall. */
export function openingScan(w: Wall, widthMm = 1200, heightMm = 1500, id = "scanopening1"): ScanInput {
  const corners = [on(w, 0, 0), on(w, widthMm, 0), on(w, widthMm, heightMm), on(w, 0, heightMm)];
  return { id, task: "opening", points: corners.map((p) => point(p, { n: w.normal })), tracking: { frames: 300, lost: 0 }, device: DEVICE };
}
