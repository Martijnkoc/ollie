import { finishAutoMeasure, measureGeometry, type AutoGeometry } from "@/lib/plan-analysis/auto-measure";
import type { DimensionReading } from "@/lib/plan-analysis/dimensions";
import type { PlacedLabel } from "@/lib/plan-analysis/rooms-auto";

/**
 * Runs the heavy image work (walls, distance transforms, outlines) off the main thread so the page stays
 * responsive. The page image only exists in this worker's memory; it is never sent anywhere.
 */
export type WorkerRequest =
  | { type: "prepare"; rgba: Uint8ClampedArray; w: number; h: number }
  | { type: "finish"; readings: DimensionReading[]; labels: PlacedLabel[]; pxPerUnit: number };

type Scope = { onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null; postMessage(message: unknown): void };
const scope = self as unknown as Scope;

let geometry: AutoGeometry | null = null;

scope.onmessage = (e) => {
  try {
    if (e.data.type === "prepare") {
      geometry = measureGeometry(e.data.rgba, e.data.w, e.data.h);
      scope.postMessage({ type: "prepared", lines: geometry?.lines ?? null });
    } else {
      if (!geometry) throw new Error("not prepared");
      scope.postMessage({ type: "finished", result: finishAutoMeasure(geometry, e.data.readings, e.data.labels, e.data.pxPerUnit) });
      geometry = null;
    }
  } catch {
    scope.postMessage({ type: "failed" });
  }
};
