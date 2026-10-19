import { MEASURE_INFO, type MeasureKey } from "@/lib/measurements/schema";
import { CAMERA_TASKS } from "@/lib/measurements/camera";
import type { ProjectWindow } from "./schema";

const MAX = 400;

/**
 * The audit log of a window: what changed between two versions, in plain words, with a timestamp. Called
 * for every change to a window, so the log holds scans, released and edited measurements, confirmations
 * and rule changes. It also sets `confirmedAt` (reviewed_at) when the user confirms.
 */
export function withAudit(prev: ProjectWindow, next: ProjectWindow, now = new Date().toISOString()): ProjectWindow {
  const events: string[] = [];
  const keys = new Set([...Object.keys(prev.measures), ...Object.keys(next.measures)] as MeasureKey[]);
  for (const k of keys) {
    const a = prev.measures[k];
    const b = next.measures[k];
    if (a === b) continue;
    const how = next.sources[k] ? `ScanTag ±${next.sources[k]!.uncertaintyMm} mm` : "handmatig";
    events.push(b === undefined ? `${MEASURE_INFO[k].label} verwijderd` : `${MEASURE_INFO[k].label}: ${a ?? "—"} → ${b} mm (${how})`);
  }
  const before = new Set(prev.camera.map((s) => s.id));
  const after = new Set(next.camera.map((s) => s.id));
  for (const s of next.camera) if (!before.has(s.id)) events.push(`ScanTag-foto toegevoegd: ${CAMERA_TASKS[s.task].title}`);
  for (const s of prev.camera) if (!after.has(s.id)) events.push(`ScanTag-foto verwijderd: ${CAMERA_TASKS[s.task].title}`);
  for (const s of next.camera) {
    const old = prev.camera.find((x) => x.id === s.id);
    if (old && !old.processed && s.processed)
      events.push(`Scan verwerkt: ${s.quality.status === "ok" ? "bruikbaar" : "extra opname nodig"}`);
    if (old && !Object.keys(old.values).length && Object.keys(s.values).length) events.push("Maten vrijgegeven na betaling");
  }
  if (prev.ruleId !== next.ruleId) events.push(`Meetregel gekozen: ${next.ruleId}`);
  if (prev.shape !== next.shape) events.push(`Raamvorm: ${next.shape}`);
  if (JSON.stringify(prev.answers) !== JSON.stringify(next.answers)) events.push("Antwoorden aangepast");
  let confirmedAt = next.confirmedAt;
  if (!prev.confirmed && next.confirmed) {
    confirmedAt = now;
    events.push(`Maten bevestigd met regel ${next.ruleId}`);
  } else if (prev.confirmed && !next.confirmed) events.push("Bevestiging vervallen");
  if (!events.length && confirmedAt === next.confirmedAt) return next;
  return { ...next, confirmedAt, audit: [...next.audit, ...events.map((event) => ({ at: now, event }))].slice(-MAX) };
}
