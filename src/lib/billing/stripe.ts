import Stripe from "stripe";
import { type Membership, membershipActive } from "../access";
import { type Db, one } from "../db";
import { UserError } from "../errors";

export function stripeMode(): "test" | "live" | "none" {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key || !process.env.STRIPE_PRICE_ID) return "none";
  return key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "live" : "test";
}

function client() {
  if (stripeMode() === "none") throw new UserError("Betalen is nog niet geconfigureerd.");
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function startCheckout(db: Db, user: { id: string; email: string }, baseUrl: string, now = new Date()) {
  const m = await one<Membership>(db, `select * from memberships where user_id = $1`, [user.id]);
  if (membershipActive(m, now)) throw new UserError("Je hebt al een actief lidmaatschap.");
  const session = await client().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    client_reference_id: user.id,
    ...(m?.stripe_customer_id ? { customer: m.stripe_customer_id } : { customer_email: user.email }),
    metadata: { user_id: user.id },
    subscription_data: { metadata: { user_id: user.id } },
    success_url: `${baseUrl}/lidmaatschap?betaling=verwerken`,
    cancel_url: `${baseUrl}/lidmaatschap?betaling=afgebroken`,
    locale: "nl",
  });
  if (!session.url) throw new UserError("Stripe gaf geen betaalpagina terug.");
  return session.url;
}

export async function openPortal(db: Db, userId: string, baseUrl: string) {
  const m = await one<Membership>(db, `select * from memberships where user_id = $1`, [userId]);
  if (!m?.stripe_customer_id) throw new UserError("Er is nog geen betaalgegevens om te beheren.");
  const session = await client().billingPortal.sessions.create({ customer: m.stripe_customer_id, return_url: `${baseUrl}/lidmaatschap` });
  return session.url;
}

/** Used when someone deletes their account: stop billing immediately. */
export async function cancelImmediately(subscriptionId: string) {
  if (stripeMode() === "none") return;
  await client().subscriptions.cancel(subscriptionId);
}

function periodOf(sub: Stripe.Subscription) {
  // Since API version 2025-03-31 the billing period lives on the subscription items.
  const items = sub.items?.data ?? [];
  const start = Math.min(...items.map((i) => i.current_period_start).filter(Boolean));
  const end = Math.max(...items.map((i) => i.current_period_end).filter(Boolean));
  const legacy = sub as unknown as { current_period_start?: number; current_period_end?: number };
  return {
    start: Number.isFinite(start)
      ? new Date(start * 1000)
      : legacy.current_period_start
        ? new Date(legacy.current_period_start * 1000)
        : null,
    end: Number.isFinite(end) ? new Date(end * 1000) : legacy.current_period_end ? new Date(legacy.current_period_end * 1000) : null,
  };
}

async function applySubscription(tx: Db, sub: Stripe.Subscription, eventAt: Date, deleted: boolean) {
  const userId = sub.metadata?.user_id;
  if (!userId) return "ignored: no user_id metadata";
  const user = await one<{ id: string }>(tx, `select id from users where id::text = $1`, [userId]);
  if (!user) return "ignored: unknown user";
  const current = await one<{ last_event_at: Date | null; stripe_subscription_id: string | null }>(
    tx,
    `select last_event_at, stripe_subscription_id from memberships where user_id = $1 for update`,
    [userId],
  );
  // Stripe does not guarantee order: never let an older event overwrite newer state.
  if (current?.last_event_at && current.last_event_at.getTime() > eventAt.getTime()) return "ignored: stale";
  // An old, cancelled subscription must not overwrite a newer one.
  if (current?.stripe_subscription_id && current.stripe_subscription_id !== sub.id && deleted) return "ignored: other subscription";
  const { start, end } = periodOf(sub);
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await tx.query(
    `insert into memberships (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end, last_event_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())
     on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id,
       status = excluded.status, current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end, last_event_at = excluded.last_event_at, updated_at = now()`,
    [userId, customer, sub.id, deleted ? "canceled" : sub.status, start, end, Boolean(sub.cancel_at_period_end || sub.cancel_at), eventAt],
  );
  return `applied: ${deleted ? "canceled" : sub.status}`;
}

export type WebhookResult = { status: number; body: Record<string, unknown> };

/**
 * Verifies the signature, records the event id and applies it in one transaction.
 * A replayed event is acknowledged without being applied again; a failure rolls back so Stripe retries.
 */
export async function handleWebhook(db: Db, rawBody: string, signature: string | null): Promise<WebhookResult> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return { status: 503, body: { error: "webhook not configured" } };
  if (!signature) return { status: 400, body: { error: "missing signature" } };
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return { status: 400, body: { error: "invalid signature" } };
  }
  const outcome = await db.transaction(async (tx) => {
    const fresh = await tx.query(`insert into stripe_events (id, type) values ($1, $2) on conflict (id) do nothing returning id`, [
      event.id,
      event.type,
    ]);
    if (fresh.length === 0) return "duplicate";
    const at = new Date(event.created * 1000);
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        return applySubscription(tx, event.data.object, at, false);
      case "customer.subscription.deleted":
        return applySubscription(tx, event.data.object, at, true);
      case "checkout.session.completed": {
        // Access is granted by the subscription events, never by checkout completion.
        const s = event.data.object;
        if (s.client_reference_id && typeof s.customer === "string") {
          await tx.query(
            `insert into memberships (user_id, stripe_customer_id, status, updated_at) select id, $2, 'incomplete', now() from users where id::text = $1
             on conflict (user_id) do update set stripe_customer_id = coalesce(memberships.stripe_customer_id, excluded.stripe_customer_id)`,
            [s.client_reference_id, s.customer],
          );
        }
        return "recorded customer";
      }
      default:
        // invoice.payment_failed, charge.refunded, …: the resulting subscription status arrives as its own event.
        return "ignored: type";
    }
  });
  return { status: 200, body: { received: true, outcome } };
}
