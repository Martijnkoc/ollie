"use client";

import type { ProjectPayment } from "@/lib/projects/schema";

type StatusResponse = { status: string; mode: "live" | "test" | "demo"; paidAt: string | null };

const KNOWN = new Set(["open", "pending", "paid", "failed", "canceled", "expired", "refunded"]);

/**
 * Asks our server for the verified status of the payment of this project. The server checks with the payment
 * provider; nothing in the URL the browser came back on is trusted.
 */
export async function refreshPayment(p: ProjectPayment): Promise<ProjectPayment | null> {
  const res = await fetch(`/api/bestellingen/${encodeURIComponent(p.orderId)}`, { headers: { "x-order-secret": p.orderSecret }, cache: "no-store" });
  if (!res.ok) return null;
  const body = (await res.json()) as StatusResponse;
  const status = body.status === "created" ? "open" : body.status;
  if (!KNOWN.has(status)) return null;
  return { ...p, status: status as ProjectPayment["status"], mode: body.mode, checkedAt: new Date().toISOString() };
}

export async function startCheckout(projectRef: string): Promise<{ orderId: string; orderSecret: string; checkoutUrl: string; mode: "live" | "test" | "demo" }> {
  const res = await fetch("/api/bestellingen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectRef }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Betalen lukt nu niet. Probeer het later opnieuw.");
  return body;
}
