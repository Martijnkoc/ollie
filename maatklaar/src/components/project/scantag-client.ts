"use client";

import type { ScanShot } from "@/lib/measurements/scan";
import type { Project, ProjectWindow } from "@/lib/projects/schema";
import { processWindow, type WindowResult } from "@/lib/scantag/process";
import type { StoredVerdicts } from "@/lib/scantag/status";
import { isPaid } from "./types";

const toInput = (s: ScanShot) => ({ id: s.id, task: s.task, points: s.points, tracking: s.tracking, device: s.device });

/**
 * Sends the geometry of ScanTag scans (points in metres, never images) to the server, for one or more windows.
 * Before payment the answer holds verdicts only; after a verified payment it also holds the measurements.
 */
export async function processWindows(project: Project, windows: ProjectWindow[]): Promise<{ released: boolean; results: WindowResult[] }> {
  const res = await fetch("/api/scantag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order: isPaid(project) && project.payment ? { id: project.payment.orderId, secret: project.payment.orderSecret } : null,
      projectRef: project.id,
      windows: windows.map((w) => ({ id: w.id, product: w.product, mounting: w.mounting, shape: w.shape, shots: w.scans.map(toInput) })),
    }),
  });
  if (!res.ok) throw new Error(res.status === 429 ? "Even rustig aan; probeer het zo opnieuw." : "De scan kon niet worden verwerkt.");
  const body = (await res.json()) as { released: boolean; windows: WindowResult[] };
  return { released: body.released, results: body.windows };
}

/** A window's scans with the server's answer merged in: statuses always, measurements only when released. */
export function mergeWindowResult(w: ProjectWindow, released: boolean, r: WindowResult): Pick<ProjectWindow, "scans" | "scanVerdicts"> {
  const scans = w.scans.map((s) => {
    const x = r.shots.find((y) => y.id === s.id);
    if (!x) return s;
    return {
      ...s,
      processed: true,
      quality: { status: x.status, reasons: x.reasons },
      values: released && x.values ? x.values : s.values,
    };
  });
  const scanVerdicts: StoredVerdicts = { context: { product: w.product, mounting: w.mounting, shape: w.shape }, targets: r.targets };
  return { scans, scanVerdicts };
}

/**
 * For the home's ceiling height, which is free and not window decoration: the same checks and measurements,
 * computed on this device.
 */
export function processLocally(shots: ScanShot[]): ScanShot[] {
  const r = processWindow({ id: "woning", product: "onbekend", mounting: "onbekend", shape: "rechthoek", shots: shots.map(toInput) }, true);
  return shots.map((s) => {
    const x = r.shots.find((y) => y.id === s.id)!;
    return { ...s, processed: true, quality: { status: x.status, reasons: x.reasons }, values: x.values ?? {} };
  });
}
