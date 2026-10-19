import type { OrderStatus, ProviderPayment } from "./types";

/** Maps a verified provider payment to our order status. A (partial) refund or chargeback withdraws access. */
export function statusFromProvider(p: ProviderPayment): OrderStatus {
  if (p.status === "paid") return p.refundedCents > 0 || p.chargedBackCents > 0 ? "refunded" : "paid";
  if (p.status === "authorized") return "pending";
  return p.status;
}

/**
 * Applies a new status idempotently and robust against out-of-order webhooks: once paid, an order only
 * moves to "refunded"; once refunded it stays refunded. Repeating the same update changes nothing.
 */
export function nextStatus(current: OrderStatus, incoming: OrderStatus): OrderStatus {
  if (current === "refunded") return "refunded";
  if (current === "paid") return incoming === "refunded" ? "refunded" : "paid";
  return incoming;
}

export function isFinal(status: OrderStatus) {
  return status === "paid" || status === "refunded" || status === "failed" || status === "canceled" || status === "expired";
}
