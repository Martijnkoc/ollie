import type { CameraShot, CameraTask } from "@/lib/measurements/camera";
import type { Status } from "@/lib/projects/status";

/**
 * Scan status of a window for every task its rule needs, without any size: what may be shown before payment.
 */
export function scanStatus(
  shots: readonly CameraShot[],
  tasks: readonly CameraTask[],
): { label: string; status: Status; done: number; total: number } {
  const total = tasks.length;
  const ok = (t: CameraTask) => shots.some((s) => s.task === t.id && s.processed && s.quality.status === "ok");
  const done = tasks.filter(ok).length;
  if (!shots.length) return { label: "Nog scannen", status: "missing", done, total };
  if (shots.some((s) => !s.processed)) return { label: "Wacht op verwerking", status: "auto", done, total };
  if (done === total) return { label: "Scan verwerkt", status: "confirmed", done, total };
  const failed = tasks.some((t) => !ok(t) && shots.some((s) => s.task === t.id));
  return {
    label: failed ? "Extra opname nodig" : `Nog ${total - done} ${total - done === 1 ? "opname" : "opnames"}`,
    status: failed ? "check" : "missing",
    done,
    total,
  };
}
