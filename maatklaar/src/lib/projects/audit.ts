import { MEASURE_INFO, type MeasureKey } from "@/lib/measurements/schema";
import { SCAN_STATUS_LABELS, SCAN_TASKS, shownMarginMm } from "@/lib/measurements/scan";
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
    const src = next.sources[k];
    const how = src ? `ScanTag ±${shownMarginMm(src.uncertaintyMm)} mm, ${SCAN_STATUS_LABELS[src.status].toLowerCase()}` : "handmatig";
    const mm = (v: number | undefined) => (v === undefined ? "—" : String(Math.round(v)));
    events.push(b === undefined ? `${MEASURE_INFO[k].label} verwijderd` : `${MEASURE_INFO[k].label}: ${mm(a)} → ${mm(b)} mm (${how})`);
  }
  const before = new Set(prev.scans.map((s) => s.id));
  const after = new Set(next.scans.map((s) => s.id));
  for (const s of next.scans)
    if (!before.has(s.id)) events.push(`ScanTag-scan toegevoegd: ${SCAN_TASKS[s.task].title} (${s.device.platform}, ${s.device.browser})`);
  for (const s of prev.scans) if (!after.has(s.id)) events.push(`ScanTag-scan verwijderd: ${SCAN_TASKS[s.task].title}`);
  for (const s of next.scans) {
    const old = prev.scans.find((x) => x.id === s.id);
    if (old && !old.processed && s.processed)
      events.push(`Scan verwerkt: ${s.quality.status === "ok" ? "bruikbaar" : `opnieuw scannen (${s.quality.reasons.join(", ")})`}`);
    if (old && !Object.keys(old.values).length && Object.keys(s.values).length) events.push("Maten vrijgegeven na betaling");
  }
  if (prev.ruleId !== next.ruleId) events.push(`Meetregel gekozen: ${next.ruleId}`);
  if (prev.product !== next.product || prev.mounting !== next.mounting) events.push(`Product: ${next.product}, montage: ${next.mounting}`);
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
