"use client";

import type { AddressSuggestion } from "@/lib/address/types";

/**
 * Hands a chosen address or a dropped plan from the landing page to the new project page. Kept in memory
 * only (client-side navigation keeps it); after a full reload the user simply starts that step again.
 */
type Handoff = { projectId: string; suggestion?: AddressSuggestion; file?: File };
let pending: Handoff | null = null;

export function setHandoff(h: Handoff) {
  pending = h;
}

export function takeAddress(projectId: string): AddressSuggestion | null {
  if (!pending || pending.projectId !== projectId || !pending.suggestion) return null;
  const s = pending.suggestion;
  pending = { ...pending, suggestion: undefined };
  return s;
}

export function takeFile(projectId: string): File | null {
  if (!pending || pending.projectId !== projectId || !pending.file) return null;
  const f = pending.file;
  pending = { ...pending, file: undefined };
  return f;
}
