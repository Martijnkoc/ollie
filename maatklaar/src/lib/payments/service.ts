import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PRICE } from "@/config/site";
import { isFinal, nextStatus, statusFromProvider } from "./status";
import type { OrderStore } from "./store";
import { PaymentError, type Order, type PaymentProvider } from "./types";

export type Deps = { store: OrderStore; provider: PaymentProvider; now?: () => Date };

const PROJECT_REF = /^[a-z0-9]{12,40}$/;
export const ORDER_ID = /^ord_[a-z0-9]{24}$/;

const token = (bytes: number) => randomBytes(bytes).toString("base64url");
const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

function secretMatches(order: Order, secret: string) {
  const a = Buffer.from(order.secretHash, "hex");
  const b = Buffer.from(hash(secret), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Creates an order for one project at the configured price and starts a payment. The price comes from the
 * server configuration; the client only sends its random project reference.
 */
export async function createOrder(projectRef: string, urls: { redirectBase: string; webhookUrl: string | null }, deps: Deps) {
  if (!PROJECT_REF.test(projectRef)) throw new PaymentError(400, "Ongeldige projectreferentie.");
  const now = (deps.now ?? (() => new Date()))().toISOString();
  const id = `ord_${randomBytes(18).toString("hex").slice(0, 24)}`;
  const secret = token(24);
  const order: Order = {
    id,
    secretHash: hash(secret),
    projectRef,
    amountCents: PRICE.amountCents,
    currency: PRICE.currency,
    provider: deps.provider.name,
    providerPaymentId: null,
    status: "created",
    mode: deps.provider.name === "demo" ? "demo" : "test",
    createdAt: now,
    updatedAt: now,
    paidAt: null,
  };
  await deps.store.insert(order);
  let created: Awaited<ReturnType<PaymentProvider["createPayment"]>>;
  try {
    created = await deps.provider.createPayment({
      orderId: id,
      orderSecret: secret,
      amountCents: order.amountCents,
      currency: order.currency,
      description: PRICE.paymentDescription,
      redirectUrl: `${urls.redirectBase}/betaling/terug?order=${id}`,
      webhookUrl: urls.webhookUrl,
    });
  } catch (err) {
    await deps.store.update(id, (o) => ({ ...o, status: "failed", updatedAt: now }));
    throw err;
  }
  await deps.store.update(id, (o) => ({ ...o, providerPaymentId: created.providerPaymentId, mode: created.mode, status: "open", updatedAt: now }));
  return { orderId: id, orderSecret: secret, checkoutUrl: created.checkoutUrl, mode: created.mode };
}

/**
 * Fetches the payment from the provider and applies its status. This is the only way an order becomes
 * paid: amount, currency and our order id must match what the provider reports.
 */
export async function syncFromProvider(order: Order, deps: Deps): Promise<Order> {
  if (!order.providerPaymentId) return order;
  const p = await deps.provider.getPayment(order.providerPaymentId);
  if (p.orderId !== order.id || p.amountCents !== order.amountCents || p.currency !== order.currency) {
    throw new PaymentError(409, "De betaling past niet bij deze bestelling.");
  }
  const incoming = statusFromProvider(p);
  const now = (deps.now ?? (() => new Date()))().toISOString();
  const updated = await deps.store.update(order.id, (current) => {
    const status = nextStatus(current.status, incoming);
    if (status === current.status && current.mode === p.mode) return null; // idempotent: nothing changes
    return { ...current, status, mode: p.mode, updatedAt: now, paidAt: status === "paid" ? (current.paidAt ?? p.paidAt ?? now) : current.paidAt };
  });
  return updated ?? order;
}

/** Status for the buyer's browser, which proves ownership with the order secret. */
export async function orderStatusForBuyer(orderId: string, secret: string, deps: Deps) {
  if (!ORDER_ID.test(orderId) || !secret || secret.length > 100) throw new PaymentError(404, "Bestelling niet gevonden.");
  let order = await deps.store.get(orderId);
  if (!order || !secretMatches(order, secret)) throw new PaymentError(404, "Bestelling niet gevonden.");
  // Not final yet (no webhook on localhost, or it is still on its way), or paid (a refund may have happened
  // since): ask the provider. If the provider is unreachable, a final stored status still stands.
  if (!isFinal(order.status) || order.status === "paid") {
    try {
      order = await syncFromProvider(order, deps);
    } catch (err) {
      if (!(isFinal(order.status) && err instanceof PaymentError && err.status >= 500)) throw err;
    }
  }
  return { orderId: order.id, projectRef: order.projectRef, status: order.status, mode: order.mode, paidAt: order.paidAt };
}

/** Mollie webhook: the body only carries a payment id. Unknown ids are acknowledged without detail. */
export async function handleWebhook(providerPaymentId: string, deps: Deps) {
  const order = await deps.store.findByPaymentId(providerPaymentId);
  if (!order) return { known: false as const };
  const updated = await syncFromProvider(order, deps);
  return { known: true as const, status: updated.status };
}

/** DEMO mode only: the fake checkout page marks a demo payment as paid or canceled. */
export async function simulateDemoPayment(orderId: string, secret: string, outcome: "paid" | "canceled", deps: Deps) {
  if (deps.provider.name !== "demo") throw new PaymentError(403, "Alleen beschikbaar in DEMO-modus.");
  const order = ORDER_ID.test(orderId) ? await deps.store.get(orderId) : null;
  if (!order || order.provider !== "demo" || !order.providerPaymentId || !secretMatches(order, secret)) throw new PaymentError(404, "Bestelling niet gevonden.");
  await deps.store.setDemo(order.providerPaymentId, outcome);
  return syncFromProvider(order, deps);
}
