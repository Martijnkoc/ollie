"use client";

import type { CameraShot } from "@/lib/measurements/camera";
import type { Project } from "@/lib/projects/schema";
import { processShots as checkShots, type ShotResult } from "@/lib/scantag/process";
import { isPaid } from "./types";

/**
 * Sends the geometry of ScanTag shots (points only, never photos) to the server. Before payment the answer
 * says whether each scan is usable; after a verified payment it also holds the measurements.
 */
export async function processShots(project: Project, shots: CameraShot[]): Promise<{ released: boolean; results: ShotResult[] }> {
  const res = await fetch("/api/scantag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order: isPaid(project) && project.payment ? { id: project.payment.orderId, secret: project.payment.orderSecret } : null,
      projectRef: project.id,
      shots: shots.map((s) => ({ id: s.id, task: s.task, orientation: s.orientation, reference: s.reference, points: s.points })),
    }),
  });
  if (!res.ok) throw new Error(res.status === 429 ? "Even rustig aan; probeer het zo opnieuw." : "De scan kon niet worden verwerkt.");
  const body = (await res.json()) as { released: boolean; shots: ShotResult[] };
  return { released: body.released, results: body.shots };
}

/** The processed shots: server status merged with the photo checks, measurements only when released. */
export function mergeResults(shots: CameraShot[], released: boolean, results: ShotResult[]): CameraShot[] {
  return shots.map((s) => {
    const r = results.find((x) => x.id === s.id);
    if (!r) return s;
    const blocking = s.photoChecks.some((c) => c.blocking);
    return {
      ...s,
      processed: true,
      quality: {
        status: r.status === "extra_opname_nodig" || blocking ? "needs_more_data" : "ok",
        issues: [...s.photoChecks.map((c) => c.text), ...r.issues].slice(0, 10),
      },
      values: released && r.values ? r.values : {},
    };
  });
}

/** For free measurements of the home (ceiling height): the same checks and sizes, computed on this device. */
export async function processLocally(shots: CameraShot[]): Promise<CameraShot[]> {
  return mergeResults(shots, true, checkShots(shots, true));
}
