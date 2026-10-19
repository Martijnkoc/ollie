import { z } from "zod";
import { CAMERA_TASK_IDS, CAMERA_TASKS, measureShot, type CameraShot } from "@/lib/measurements/camera";
import { tooRough } from "@/lib/measurements/photo";

/**
 * ScanTag processing on the server. The browser sends only the geometry of a scan: the tapped and snapped
 * points in photo pixels, never the photo. The server checks whether the scan is usable and, only for a
 * verified paid order, releases the measurements. Before payment the answer holds statuses only.
 */
const marked = z.object({ x: z.number().finite(), y: z.number().finite(), sigma: z.number().finite().nonnegative().max(100) });

export const scanShotSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{6,24}$/),
  task: z.enum(CAMERA_TASK_IDS),
  orientation: z.enum(["auto", "liggend", "staand"]),
  reference: z.array(marked).min(4).max(8),
  points: z.array(marked).max(8),
});

export const scanRequestSchema = z.object({
  /** The buyer's order and its secret; absent before payment. */
  order: z.object({ id: z.string().max(80), secret: z.string().max(100) }).nullable(),
  projectRef: z.string().regex(/^[a-z0-9]{12,40}$/),
  shots: z.array(scanShotSchema).min(1).max(40),
});
export type ScanRequest = z.infer<typeof scanRequestSchema>;

export type ShotResult = {
  id: string;
  status: "verwerkt" | "extra_opname_nodig";
  issues: string[];
  /** Only when released: the measurements of this photo. */
  values?: CameraShot["values"];
};

export function processShots(shots: ScanRequest["shots"], release: boolean): ShotResult[] {
  return shots.map((shot) => {
    const task = CAMERA_TASKS[shot.task];
    if (shot.reference.length !== task.references * 4)
      return {
        id: shot.id,
        status: "extra_opname_nodig",
        issues: [task.references === 2 ? "Tik de hoeken van beide vellen aan." : "Tik de vier hoeken van de referentie aan."],
      };
    const r = measureShot(task, shot);
    if (!r.ok) return { id: shot.id, status: "extra_opname_nodig", issues: [r.reason] };
    const rough = Object.values(r.values).some((v) => tooRough(v));
    return {
      id: shot.id,
      status: rough ? "extra_opname_nodig" : "verwerkt",
      issues: rough ? ["Te onnauwkeurig: kom dichterbij of zet de vellen groter in beeld, en maak een nieuwe foto."] : [],
      ...(release ? { values: r.values } : {}),
    };
  });
}
