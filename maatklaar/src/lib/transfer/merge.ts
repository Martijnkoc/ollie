import type { Project } from "@/lib/projects/schema";

/**
 * Brings windows (and a payment) from another device into this project. A window from the other device
 * replaces the one with the same id here (it carries its own audit log), new windows are added, windows
 * that only exist here stay. Rooms, plan and analyses stay as they are on this device.
 */
export function mergeIncoming(local: Project, incoming: Project): { project: Project; updated: number; added: number } {
  if (local.id !== incoming.id) throw new Error("Ander project");
  let updated = 0;
  let added = 0;
  const byId = new Map(incoming.windows.map((w) => [w.id, w]));
  const windows = local.windows.map((w) => {
    const other = byId.get(w.id);
    if (!other) return w;
    byId.delete(w.id);
    if (JSON.stringify(other) === JSON.stringify(w)) return w;
    updated++;
    return other;
  });
  for (const w of byId.values()) {
    windows.push(w);
    added++;
  }
  const payment = local.payment?.status === "paid" ? local.payment : (incoming.payment ?? local.payment);
  // Scans of the whole home (ceiling height) made on the other device come along too.
  const scans = [...local.scans, ...incoming.scans.filter((s) => !local.scans.some((x) => x.id === s.id))];
  return { project: { ...local, windows, scans, payment, updatedAt: new Date().toISOString() }, updated, added };
}

/** What travels to the other device: the project without the plan analyses (large and not needed to scan). */
export function forTransfer(p: Project): Project {
  return { ...p, analyses: [] };
}
