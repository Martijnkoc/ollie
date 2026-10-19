"use client";

import { open, randomToken, seal, sha256Hex, transferFragment, type Sealed } from "@/lib/transfer/crypto";
import { forTransfer } from "@/lib/transfer/merge";
import type { Project } from "@/lib/projects/schema";

export type Outbound = { v: 1; project: Project; returnToken: string };
export type ReturnContext = { id: string; token: string; key: string; until: string };

/** Starts a transfer: encrypts the project here, the server only gets ciphertext and token hashes. */
export async function startTransfer(project: Project) {
  const key = randomToken(32);
  const token = randomToken(24);
  const returnToken = randomToken(24);
  const payload = await seal({ v: 1, project: forTransfer(project), returnToken } satisfies Outbound, key);
  const res = await fetch("/api/overdracht", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, tokenHash: await sha256Hex(token), returnHash: await sha256Hex(returnToken) }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; expiresAt?: string; returnExpiresAt?: string; error?: string };
  if (!res.ok || !body.id) throw new Error(body.error ?? "De overdracht kon niet worden gestart.");
  return {
    url: `${location.origin}/overdracht#${transferFragment(body.id, token, key)}`,
    expiresAt: body.expiresAt!,
    back: { id: body.id, token: returnToken, key, until: body.returnExpiresAt! } satisfies ReturnContext,
  };
}

/** Asks whether the other device sent its scans back; null while nothing arrived. */
export async function fetchBack(ctx: ReturnContext): Promise<Project | null> {
  const res = await fetch(`/api/overdracht/${ctx.id}/terug/ophalen`, { method: "POST", headers: { "x-return-token": ctx.token } });
  if (res.status === 404 || res.status === 410) throw new Error("verlopen");
  if (!res.ok) return null;
  const body = (await res.json()) as { payload: Sealed | null };
  if (!body.payload) return null;
  return (await open<{ v: 1; project: Project }>(body.payload, ctx.key)).project;
}

export async function sendBack(ctx: ReturnContext, project: Project) {
  const payload = await seal({ v: 1, project: forTransfer(project) }, ctx.key);
  const res = await fetch(`/api/overdracht/${ctx.id}/terug`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-return-token": ctx.token },
    body: JSON.stringify(payload),
  });
  if (!res.ok)
    throw new Error(res.status === 410 ? "De overdracht is verlopen. Start op je computer een nieuwe." : "Terugsturen lukte niet.");
}

const RETURN_KEY = (projectId: string) => `maatklaar:terug:${projectId}`;

/** The way back lives on the phone only, for as long as the transfer is valid. */
export function saveReturnContext(projectId: string, ctx: ReturnContext) {
  try {
    localStorage.setItem(RETURN_KEY(projectId), JSON.stringify(ctx));
  } catch {
    // Private mode: sending back is then not offered.
  }
}

export function loadReturnContext(projectId: string): ReturnContext | null {
  try {
    const raw = localStorage.getItem(RETURN_KEY(projectId));
    if (!raw) return null;
    const ctx = JSON.parse(raw) as ReturnContext;
    if (Date.parse(ctx.until) < Date.now()) {
      localStorage.removeItem(RETURN_KEY(projectId));
      return null;
    }
    return ctx;
  } catch {
    return null;
  }
}
