import { z } from "zod";
import { scanCriteria } from "@/config/scantag";
import { MOUNTINGS, PRODUCT_FAMILIES } from "@/lib/measurements/schema";
import {
  assessShot,
  SCAN_TASKS,
  scanInputSchema,
  verdicts,
  WINDOW_SHAPES,
  type ScanInput,
  type ScanReason,
  type ScanShot,
  type ScanTarget,
  type TargetVerdict,
  type VerdictContext,
} from "@/lib/measurements/scan";

/**
 * ScanTag processing on the server. The browser sends only the geometry of a scan: points in metres from the
 * phone's AR tracking, never an image. The server checks every scan and gives a verdict per measurement;
 * only for a verified paid order does the answer also hold the measurements. Nothing is stored.
 */
export const scanWindowSchema = z.object({
  id: z.string().min(1).max(40),
  product: z.enum(PRODUCT_FAMILIES),
  mounting: z.enum(MOUNTINGS),
  shape: z.enum(WINDOW_SHAPES),
  shots: z.array(scanInputSchema).min(1).max(30),
});

export const scanRequestSchema = z.object({
  /** The buyer's order and its secret; absent before payment. */
  order: z.object({ id: z.string().max(80), secret: z.string().max(100) }).nullable(),
  projectRef: z.string().regex(/^[a-z0-9]{12,40}$/),
  windows: z.array(scanWindowSchema).min(1).max(60),
});
export type ScanRequest = z.infer<typeof scanRequestSchema>;

export type ShotResult = {
  id: string;
  status: "ok" | "retake_required";
  reasons: ScanReason[];
  /** Only when released: the measurements of this scan. */
  values?: ScanShot["values"];
};
export type WindowResult = { id: string; shots: ShotResult[]; targets: Partial<Record<ScanTarget, TargetVerdict>> };

export function processWindow(win: VerdictContext & { id: string; shots: readonly ScanInput[] }, release: boolean): WindowResult {
  const criteria = scanCriteria(win.product, win.mounting);
  const assessed = win.shots.map((shot) => ({ shot, ...assessShot(SCAN_TASKS[shot.task], shot, criteria) }));
  const targets = verdicts(
    assessed.map((a) => ({ task: a.shot.task, quality: { status: a.status, reasons: a.reasons }, values: a.values })),
    win,
  );
  return {
    id: win.id,
    shots: assessed.map((a) => ({ id: a.shot.id, status: a.status, reasons: a.reasons, ...(release ? { values: a.values } : {}) })),
    targets,
  };
}

export function processWindows(windows: ScanRequest["windows"], release: boolean): WindowResult[] {
  return windows.map((w) => processWindow(w, release));
}
