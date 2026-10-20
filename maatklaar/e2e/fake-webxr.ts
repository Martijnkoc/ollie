import type { Page } from "@playwright/test";

/**
 * A test double for WebXR "immersive-ar" with hit-test, for Playwright only (desktop Chromium has no AR).
 * It simulates a flat wall 1,5 m in front of the phone; `window.__xr.aim(xMm, yMm, outMm)` points the
 * cross-hair at a spot on that wall (x to the right, y down, from the top-left corner of the window opening;
 * outMm < 0 lies behind the wall face, like a frame in the recess). The hit carries the wall's normal and a
 * fraction of a millimetre of jitter, like a phone held still. Nothing of this is shipped to users.
 */
export async function installFakeWebXR(page: Page, opts: { deny?: boolean } = {}) {
  await page.addInitScript(
    ({ deny }) => {
      const WALL_Z = -1.5;
      const ORIGIN = { x: -0.6, y: 0.75 };
      const state = { aim: null as null | { x: number; y: number; z: number }, tracking: true, frame: 0 };
      const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      const perspective = () => {
        const f = 1 / Math.tan((60 * Math.PI) / 360);
        const aspect = innerWidth / innerHeight;
        const near = 0.05;
        const far = 100;
        return new Float32Array([
          f / aspect,
          0,
          0,
          0,
          0,
          f,
          0,
          0,
          0,
          0,
          (far + near) / (near - far),
          -1,
          0,
          0,
          (2 * far * near) / (near - far),
          0,
        ]);
      };
      (window as unknown as { __xr: unknown }).__xr = {
        aim(xMm: number, yMm: number, outMm = 0) {
          state.aim = { x: ORIGIN.x + xMm / 1000, y: ORIGIN.y - yMm / 1000, z: WALL_Z + outMm / 1000 };
        },
        away() {
          state.aim = null;
        },
        setTracking(on: boolean) {
          state.tracking = on;
        },
      };

      class FakeSession extends EventTarget {
        enabledFeatures = ["hit-test", "dom-overlay", "local", "viewer"];
        renderState: { baseLayer: unknown } = { baseLayer: null };
        ended = false;
        updateRenderState(s: { baseLayer: unknown }) {
          this.renderState = { ...this.renderState, ...s };
        }
        async requestReferenceSpace(type: string) {
          return { type };
        }
        async requestHitTestSource() {
          return { cancel() {} };
        }
        requestAnimationFrame(cb: (t: number, frame: unknown) => void) {
          return window.setTimeout(() => {
            if (this.ended) return;
            state.frame++;
            const j = (k: number) => Math.sin(state.frame * 12.9898 + k * 78.233) * 0.0003;
            const frame = {
              getViewerPose: () => ({
                emulatedPosition: !state.tracking,
                transform: {
                  position: { x: 0, y: 0, z: 0, w: 1 },
                  orientation: { x: 0, y: 0, z: 0, w: 1 },
                  inverse: { matrix: identity() },
                },
                views: [{ projectionMatrix: perspective(), transform: { inverse: { matrix: identity() } } }],
              }),
              getHitTestResults: () =>
                state.aim
                  ? [
                      {
                        getPose: () => ({
                          transform: {
                            position: { x: state.aim!.x + j(1), y: state.aim!.y + j(2), z: state.aim!.z + j(3), w: 1 },
                            // The pose's y axis is the surface normal: the wall faces the phone (+z).
                            orientation: { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 },
                          },
                        }),
                      },
                    ]
                  : [],
            };
            cb(performance.now(), frame);
          }, 16);
        }
        async end() {
          if (this.ended) return;
          this.ended = true;
          this.dispatchEvent(new Event("end"));
        }
      }

      (window as unknown as { XRWebGLLayer: unknown }).XRWebGLLayer = class {
        framebuffer = null;
      };
      Object.defineProperty(navigator, "xr", {
        configurable: true,
        value: {
          isSessionSupported: async (mode: string) => mode === "immersive-ar",
          requestSession: async () => {
            if (deny) throw new DOMException("Toestemming geweigerd", "NotAllowedError");
            return new FakeSession();
          },
        },
      });
    },
    { deny: opts.deny ?? false },
  );
}
