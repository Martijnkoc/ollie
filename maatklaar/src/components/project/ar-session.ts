"use client";

import type { Vec3 } from "@/lib/measurements/ar-geometry";

/**
 * A WebXR "immersive-ar" session with hit-test: each frame says where the ray through the centre of the screen
 * hits a real surface, in metres, in a reference space that the device's motion tracking keeps fixed to the
 * room. That is the only scale ScanTag uses. Depth sensing is used when the browser offers it, to cross-check
 * the distance; it is never assumed. Our UI is a DOM overlay; WebGL only clears the frame so the camera shows.
 */

// The few WebXR types we use (not part of TypeScript's DOM library).
type XRVec = { x: number; y: number; z: number; w?: number };
type XRRigid = { position: XRVec; orientation: XRVec; inverse: { matrix: Float32Array } };
type XRViewLike = { projectionMatrix: Float32Array; transform: XRRigid };
type XRViewerPoseLike = { transform: XRRigid; emulatedPosition: boolean; views: XRViewLike[] };
type XRHitResultLike = { getPose(space: unknown): { transform: XRRigid } | null };
type XRDepthLike = { getDepthInMeters(x: number, y: number): number };
type XRFrameLike = {
  getViewerPose(space: unknown): XRViewerPoseLike | null;
  getHitTestResults(source: unknown): XRHitResultLike[];
  getDepthInformation?(view: XRViewLike): XRDepthLike | null;
};
type XRSessionLike = EventTarget & {
  enabledFeatures?: readonly string[];
  depthUsage?: string;
  renderState: { baseLayer?: { framebuffer: WebGLFramebuffer | null } | null };
  updateRenderState(s: { baseLayer: unknown }): Promise<void> | void;
  requestReferenceSpace(type: string): Promise<unknown>;
  requestHitTestSource?(opts: { space: unknown }): Promise<{ cancel(): void }>;
  requestAnimationFrame(cb: (t: number, frame: XRFrameLike) => void): number;
  end(): Promise<void>;
};
type XRSystemLike = { requestSession(mode: string, opts: Record<string, unknown>): Promise<XRSessionLike> };

export type ArHit = { p: Vec3; n: Vec3 | null; rangeM: number };
export type ArFrame = {
  /** The device knows where it is (not lost, not estimated). */
  tracking: boolean;
  hit: ArHit | null;
  /** |hit distance − depth map at the centre| in mm, when the device gives depth. */
  depthDiffMm: number | null;
  /** Screen position (CSS px within the overlay) of a point in the session space; null behind the camera. */
  toScreen: (p: Vec3) => { x: number; y: number } | null;
};
export type ArFeatures = { hitTest: boolean; depthSensing: boolean; domOverlay: boolean };
export type ArHandle = { features: ArFeatures; end: () => Promise<void> };

/** The surface normal: the y axis of the hit pose, rotated by its orientation. */
function normalOf(q: XRVec): Vec3 {
  const w = q.w ?? 1;
  return { x: 2 * (q.x * q.y - w * q.z), y: 1 - 2 * (q.x * q.x + q.z * q.z), z: 2 * (q.y * q.z + w * q.x) };
}

function apply(m: Float32Array, p: Vec3) {
  const x = m[0]! * p.x + m[4]! * p.y + m[8]! * p.z + m[12]!;
  const y = m[1]! * p.x + m[5]! * p.y + m[9]! * p.z + m[13]!;
  const z = m[2]! * p.x + m[6]! * p.y + m[10]! * p.z + m[14]!;
  const w = m[3]! * p.x + m[7]! * p.y + m[11]! * p.z + m[15]!;
  return { x, y, z, w };
}

export async function startArSession(overlay: HTMLElement, onFrame: (f: ArFrame) => void, onEnd: () => void): Promise<ArHandle> {
  const xr = (navigator as Navigator & { xr?: XRSystemLike }).xr;
  if (!xr) throw new DOMException("Geen WebXR", "NotSupportedError");
  const session = await xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test", "dom-overlay"],
    optionalFeatures: ["depth-sensing"],
    domOverlay: { root: overlay },
    depthSensing: { usagePreference: ["cpu-optimized"], dataFormatPreference: ["luminance-alpha", "float32"] },
  });
  let ended = false;
  const cleanup: (() => void)[] = [];
  session.addEventListener("end", () => {
    ended = true;
    cleanup.forEach((f) => f());
    onEnd();
  });
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", { xrCompatible: true, alpha: true }) as WebGLRenderingContext | null;
    if (!gl) throw new DOMException("Geen WebGL", "NotSupportedError");
    const Layer = (window as unknown as { XRWebGLLayer: new (s: XRSessionLike, gl: WebGLRenderingContext) => unknown }).XRWebGLLayer;
    await session.updateRenderState({ baseLayer: new Layer(session, gl) });
    const local = await session.requestReferenceSpace("local");
    const viewer = await session.requestReferenceSpace("viewer");
    if (!session.requestHitTestSource) throw new DOMException("Geen hit-test", "NotSupportedError");
    const source = await session.requestHitTestSource({ space: viewer });
    cleanup.push(() => source.cancel());
    const features: ArFeatures = {
      hitTest: true,
      domOverlay: session.enabledFeatures ? session.enabledFeatures.includes("dom-overlay") : true,
      depthSensing: session.enabledFeatures?.includes("depth-sensing") === true && session.depthUsage === "cpu-optimized",
    };

    const loop = (_t: number, frame: XRFrameLike) => {
      if (ended) return;
      session.requestAnimationFrame(loop);
      const fb = session.renderState.baseLayer?.framebuffer ?? null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const pose = frame.getViewerPose(local);
      const view = pose?.views[0] ?? null;
      const tracking = Boolean(pose) && !pose!.emulatedPosition;
      let hit: ArHit | null = null;
      const r = frame.getHitTestResults(source)[0];
      const hp = r?.getPose(local);
      if (hp && pose) {
        const p = { x: hp.transform.position.x, y: hp.transform.position.y, z: hp.transform.position.z };
        const c = pose.transform.position;
        hit = { p, n: normalOf(hp.transform.orientation), rangeM: Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) };
      }
      let depthDiffMm: number | null = null;
      if (features.depthSensing && hit && view && frame.getDepthInformation) {
        try {
          const d = frame.getDepthInformation(view)?.getDepthInMeters(0.5, 0.5);
          if (d && d > 0) depthDiffMm = Math.abs(hit.rangeM - d) * 1000;
        } catch {
          depthDiffMm = null;
        }
      }
      const toScreen = (p: Vec3) => {
        if (!view) return null;
        const v = apply(view.transform.inverse.matrix, p);
        if (v.z >= 0) return null;
        const c = apply(view.projectionMatrix, { x: v.x, y: v.y, z: v.z });
        if (!c.w) return null;
        return { x: ((c.x / c.w + 1) / 2) * overlay.clientWidth, y: ((1 - c.y / c.w) / 2) * overlay.clientHeight };
      };
      onFrame({ tracking, hit, depthDiffMm, toScreen });
    };
    session.requestAnimationFrame(loop);
    return {
      features,
      end: async () => {
        if (!ended) await session.end().catch(() => undefined);
      },
    };
  } catch (err) {
    if (!ended) await session.end().catch(() => undefined);
    throw err;
  }
}
