import Stripe from "stripe";
import { type Rights, assertActive } from "./access";
import { CURRENCY } from "./config";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { type Order, completeLocked, lockOrder, markCancelledWithRefund, mayCancelWithRefund, orderEvent } from "./orders";
import { stripe, stripeMode } from "./payments-client";

/*
 * Money flow (Stripe Connect, "separate charges and transfers"):
 * 1. The buyer pays the agreed price to the platform through Stripe Checkout (iDEAL, card, …).
 * 2. A verified webhook marks the order paid. Never a redirect or a query parameter.
 * 3. When the buyer accepts the delivery (or after the acceptance window), the platform transfers the
 *    price minus the platform fee to the maker's connected account.
 * 4. Before that, a cancellation refunds the buyer in full.
 */

export type PayoutAccount = {
  user_id: string;
  stripe_account_id: string;
  details_submitted: boolean;
  payouts_enabled: boolean;
  transfers_active: boolean;
  requirements_due: string[];
};

export async function payoutAccount(db: Db, userId: string) {
  return one<PayoutAccount>(db, `select * from payout_accounts where user_id = $1`, [userId]);
}

/** A maker can be paid through the platform once Stripe has activated transfers to their account. */
export function canReceive(a: PayoutAccount | undefined) {
  return Boolean(a?.transfers_active && a.payouts_enabled);
}

async function saveAccount(db: Db, userId: string, account: Stripe.Account) {
  await db.query(
    `insert into payout_accounts (user_id, stripe_account_id, details_submitted, payouts_enabled, transfers_active, requirements_due, updated_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (user_id) do update set details_submitted = excluded.details_submitted, payouts_enabled = excluded.payouts_enabled,
       transfers_active = excluded.transfers_active, requirements_due = excluded.requirements_due, updated_at = now()
     where payout_accounts.stripe_account_id = excluded.stripe_account_id`,
    [
      userId,
      account.id,
      Boolean(account.details_submitted),
      Boolean(account.payouts_enabled),
      account.capabilities?.transfers === "active",
      account.requirements?.currently_due ?? [],
    ],
  );
}

/** Creates the connected account once and returns a Stripe-hosted onboarding link (identity checks happen there). */
export async function onboardingLink(db: Db, r: Rights, baseUrl: string) {
  assertActive(r);
  const s = stripe();
  let account = await payoutAccount(db, r.user.id);
  if (!account) {
    const created = await s.accounts.create(
      {
        country: "NL",
        email: r.user.email,
        controller: {
          fees: { payer: "application" },
          losses: { payments: "application" },
          stripe_dashboard: { type: "express" },
        },
        capabilities: { transfers: { requested: true } },
        metadata: { user_id: r.user.id },
      },
      { idempotencyKey: `account-${r.user.id}` },
    );
    await saveAccount(db, r.user.id, created);
    account = await payoutAccount(db, r.user.id);
  }
  const link = await s.accountLinks.create({
    account: account!.stripe_account_id,
    refresh_url: `${baseUrl}/dashboard/uitbetalingen?opnieuw=1`,
    return_url: `${baseUrl}/dashboard/uitbetalingen?terug=1`,
    type: "account_onboarding",
  });
  return link.url;
}

/** Reads the account from Stripe itself (after returning from onboarding); webhooks keep it current too. */
export async function refreshAccount(db: Db, userId: string) {
  const account = await payoutAccount(db, userId);
  if (!account || stripeMode() === "none") return account;
  await saveAccount(db, userId, await stripe().accounts.retrieve(account.stripe_account_id));
  return payoutAccount(db, userId);
}

export async function dashboardLink(db: Db, userId: string) {
  const account = await payoutAccount(db, userId);
  if (!account) throw new UserError("Je hebt nog geen uitbetaalaccount.");
  return (await stripe().accounts.createLoginLink(account.stripe_account_id)).url;
}

/** Starts Stripe Checkout for an order the buyer has agreed to. Payment is only confirmed by the webhook. */
export async function startCheckout(db: Db, r: Rights, orderId: string, baseUrl: string) {
  assertActive(r);
  const o = await one<Order & { buyer_email: string }>(
    db,
    `select o.*, u.email as buyer_email, coalesce(sp.display_name, 'de maker') as seller_name
     from orders o join users u on u.id = o.buyer_id left join profiles sp on sp.user_id = o.seller_id where o.id::text = $1`,
    [orderId],
  );
  if (!o || o.buyer_id !== r.user.id) throw new UserError("Deze opdracht bestaat niet.");
  if (o.status !== "awaiting_payment" || o.payment_status !== "none" || !o.price_cents)
    throw new UserError("Deze opdracht hoeft niet betaald te worden.");
  if (stripeMode() === "none") throw new UserError("Online betalen is nog niet geconfigureerd. Er is niets afgeschreven.");
  if (!canReceive(await payoutAccount(db, o.seller_id!))) {
    throw new UserError(`${o.seller_name} kan nog geen betalingen ontvangen. Stuur een bericht; zodra dat geregeld is, kun je betalen.`);
  }
  const s = stripe();
  // At most one open payment page per order: a previous one is closed so it cannot be paid twice.
  if (o.stripe_checkout_session_id) {
    try {
      await s.checkout.sessions.expire(o.stripe_checkout_session_id);
    } catch {
      // Already expired or completed; a completed one is handled by the webhook.
    }
  }
  const session = await s.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: o.price_cents,
          product_data: { name: o.title, description: `Opdracht SY-${o.ref} bij ${o.seller_name}` },
        },
      },
    ],
    client_reference_id: o.id,
    customer_email: o.buyer_email,
    metadata: { order_id: o.id },
    payment_intent_data: { transfer_group: `order_${o.id}`, metadata: { order_id: o.id } },
    success_url: `${baseUrl}/opdrachten/${o.id}?betaling=verwerken`,
    cancel_url: `${baseUrl}/opdrachten/${o.id}?betaling=afgebroken`,
    locale: "nl",
  });
  if (!session.url) throw new UserError("Stripe gaf geen betaalpagina terug.");
  await db.query(`update orders set stripe_checkout_session_id = $2, updated_at = now() where id = $1 and status = 'awaiting_payment'`, [
    o.id,
    session.id,
  ]);
  return session.url;
}

/** Best effort: closes an unpaid payment page when an order is declined or withdrawn. */
export async function expireCheckout(sessionId: string | null) {
  if (!sessionId || stripeMode() === "none") return;
  try {
    await stripe().checkout.sessions.expire(sessionId);
  } catch {
    // Nothing to close.
  }
}

/** Full refund of a paid order that has not been released to the maker. */
export async function refundOrder(
  db: Db,
  r: Rights | null,
  orderId: string,
  reason: string,
  opts: { staff?: boolean } = {},
  now = new Date(),
) {
  const o = await one<Order>(db, `select * from orders where id::text = $1`, [orderId]);
  if (!o) throw new UserError("Deze opdracht bestaat niet.");
  if (!opts.staff && (!r || !mayCancelWithRefund(o, r.user.id, now))) throw new UserError("Je kunt deze opdracht nu niet annuleren.");
  if (o.payment_status !== "paid" || o.transfer_status === "sent")
    throw new UserError("Deze opdracht kan niet (meer) via ons worden terugbetaald.");
  if (!o.stripe_payment_intent_id) throw new UserError("Er is geen betaling gevonden om terug te betalen.");
  if (stripeMode() === "none") throw new UserError("Terugbetalen kan nu niet: online betalen is niet geconfigureerd.");
  const refund = await stripe().refunds.create(
    { payment_intent: o.stripe_payment_intent_id, metadata: { order_id: o.id } },
    { idempotencyKey: `refund-${o.id}` },
  );
  await db.transaction(async (tx) => {
    const locked = await lockOrder(tx, o.id);
    if (locked.payment_status !== "paid") return;
    await markCancelledWithRefund(tx, o.id, r?.user.id ?? null, reason.trim(), refund.id, now);
  });
}

/** Pays the maker for a completed order. Safe to retry: the transfer has an idempotency key. */
export async function releaseFunds(db: Db, orderId: string, now = new Date()) {
  const o = await one<Order>(db, `select * from orders where id::text = $1`, [orderId]);
  if (!o || o.status !== "completed" || o.payment_status !== "paid" || o.transfer_status === "sent") return "skipped";
  if (stripeMode() === "none" || !o.seller_id || !o.seller_amount_cents) return "waiting";
  const account = await payoutAccount(db, o.seller_id);
  if (!account) return "waiting";
  try {
    const transfer = await stripe().transfers.create(
      {
        amount: o.seller_amount_cents,
        currency: CURRENCY,
        destination: account.stripe_account_id,
        transfer_group: `order_${o.id}`,
        ...(o.stripe_charge_id ? { source_transaction: o.stripe_charge_id } : {}),
        metadata: { order_id: o.id },
      },
      { idempotencyKey: `transfer-${o.id}` },
    );
    await db.query(`update orders set transfer_status = 'sent', stripe_transfer_id = $2, updated_at = $3 where id = $1`, [
      o.id,
      transfer.id,
      now,
    ]);
    await orderEvent(db, o.id, null, "paid_out", "", now);
    return "sent";
  } catch (err) {
    console.error(`[payments] transfer for order ${o.id} failed: ${err instanceof Error ? err.message : err}`);
    await db.query(`update orders set transfer_status = 'failed', updated_at = $2 where id = $1`, [o.id, now]);
    return "failed";
  }
}

/** Staff decision on a complaint. Every outcome is logged with its reason. */
export async function resolveDispute(
  db: Db,
  r: Rights,
  orderId: string,
  outcome: "refund" | "release" | "resume",
  note: string,
  now = new Date(),
) {
  if (!r.staff) throw new UserError("Alleen voor moderatoren.");
  const why = note.trim();
  if (why.length < 5) throw new UserError("Geef een toelichting (minstens 5 tekens); beide partijen zien die.");
  const o = await one<Order>(db, `select * from orders where id::text = $1`, [orderId]);
  if (!o || o.status !== "disputed") throw new UserError("Deze klacht is al afgehandeld.");
  if (outcome === "refund") {
    if (o.payment_status === "paid") await refundOrder(db, r, orderId, why, { staff: true }, now);
    else
      await db.query(
        `update orders set status = 'cancelled', cancelled_at = $2, cancelled_by = $3, cancel_reason = $4, updated_at = $2 where id = $1`,
        [orderId, now, r.user.id, why],
      );
  } else {
    await db.transaction(async (tx) => {
      const locked = await lockOrder(tx, orderId);
      if (locked.status !== "disputed") throw new UserError("Deze klacht is al afgehandeld.");
      if (outcome === "release") await completeLocked(tx, locked, r.user.id, "dispute_released", why, now);
      else {
        await tx.query(`update orders set status = $2, updated_at = $3 where id = $1`, [
          orderId,
          locked.delivered_at ? "delivered" : "in_progress",
          now,
        ]);
        await orderEvent(tx, orderId, r.user.id, "dispute_resumed", why, now);
      }
    });
    if (outcome === "release") await releaseFunds(db, orderId, now);
  }
  await db.query(`insert into moderation_actions (actor_id, target_id, action, reason) values ($1, $2, $3, $4)`, [
    r.user.id,
    o.seller_id,
    `dispute_${outcome}`,
    why,
  ]);
}

/* ---------- Webhooks ---------- */

async function paid(tx: Db, session: Stripe.Checkout.Session, now: Date) {
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId) return "ignored: no order";
  const o = await one<Order>(tx, `select * from orders where id::text = $1 for update`, [orderId]);
  if (!o) return "ignored: unknown order";
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
  if (session.amount_total !== o.price_cents || session.currency !== CURRENCY) {
    // Never mark something paid that does not match what was agreed; a moderator looks at it.
    await orderEvent(tx, o.id, null, "payment_mismatch", `${session.amount_total} ${session.currency}`, now);
    return "flagged: amount mismatch";
  }
  if (o.payment_status !== "none") {
    if (o.stripe_payment_intent_id === paymentIntent) return "duplicate";
    // A second payment for the same order (two payment pages): it is refunded, never kept.
    await orderEvent(tx, o.id, null, "duplicate_payment", paymentIntent ?? "", now);
    return `refund_duplicate:${paymentIntent}`;
  }
  let charge: string | null = null;
  if (paymentIntent && stripeMode() !== "none") {
    try {
      const pi = await stripe().paymentIntents.retrieve(paymentIntent);
      charge = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null);
    } catch {
      // The transfer falls back to no source_transaction.
    }
  }
  if (o.status !== "awaiting_payment") {
    // Paid after the order was cancelled: keep the money traceable and let a moderator refund it.
    await tx.query(
      `update orders set payment_status = 'paid', stripe_payment_intent_id = $2, stripe_charge_id = $3, paid_at = $4, status = 'disputed',
         disputed_at = $4, dispute_reason = 'Betaling ontvangen voor een opdracht die niet meer liep; terugbetalen.', updated_at = $4 where id = $1`,
      [o.id, paymentIntent, charge, now],
    );
    await orderEvent(tx, o.id, null, "paid_after_cancel", "", now);
    return "flagged: paid after cancel";
  }
  await tx.query(
    `update orders set status = 'in_progress', payment_status = 'paid', stripe_checkout_session_id = $2, stripe_payment_intent_id = $3,
       stripe_charge_id = $4, paid_at = $5::timestamptz, due_at = $5::timestamptz + make_interval(days => delivery_days), updated_at = $5 where id = $1`,
    [o.id, session.id, paymentIntent, charge, now],
  );
  await orderEvent(tx, o.id, null, "paid", "", now);
  return `paid:${o.id}`;
}

export type WebhookResult = { status: number; body: Record<string, unknown> };

function verify(rawBody: string, signature: string) {
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(Boolean) as string[];
  for (const secret of secrets) {
    try {
      // constructEvent is a static helper; it needs no API key.
      return Stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      // Try the next secret (platform and connected-account endpoints have their own).
    }
  }
  return undefined;
}

/**
 * Verifies the signature, records the event id and applies it in one transaction. A replayed event is
 * acknowledged without being applied again; a failure rolls back so Stripe retries.
 */
export async function handleWebhook(db: Db, rawBody: string, signature: string | null, now = new Date()): Promise<WebhookResult> {
  if (!process.env.STRIPE_WEBHOOK_SECRET && !process.env.STRIPE_CONNECT_WEBHOOK_SECRET)
    return { status: 503, body: { error: "webhook not configured" } };
  if (!signature) return { status: 400, body: { error: "missing signature" } };
  const event = verify(rawBody, signature);
  if (!event) return { status: 400, body: { error: "invalid signature" } };

  const outcome = await db.transaction(async (tx) => {
    const fresh = await tx.query(`insert into stripe_events (id, type) values ($1, $2) on conflict (id) do nothing returning id`, [
      event.id,
      event.type,
    ]);
    if (fresh.length === 0) return "duplicate";
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== "paid") return "pending: not paid yet";
        return paid(tx, session, now);
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.order_id;
        if (orderId)
          await orderEvent(tx, orderId, null, event.type === "checkout.session.expired" ? "checkout_expired" : "payment_failed", "", now);
        return "recorded";
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (!pi || !charge.refunded) return "ignored: partial";
        await tx.query(
          `update orders set payment_status = 'refunded', updated_at = $2 where stripe_payment_intent_id = $1 and payment_status in ('paid', 'refund_pending')`,
          [pi, now],
        );
        return "refunded";
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const pi = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
        const rows = await tx.query<{ id: string }>(
          `update orders set status = 'disputed', disputed_at = $2, dispute_reason = 'Chargeback via de bank of kaartuitgever.', updated_at = $2
           where stripe_payment_intent_id = $1 and status in ('in_progress', 'delivered') returning id`,
          [pi, now],
        );
        for (const r of rows) await orderEvent(tx, r.id, null, "chargeback", "", now);
        return "dispute recorded";
      }
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const owner = await one<{ user_id: string }>(tx, `select user_id from payout_accounts where stripe_account_id = $1`, [account.id]);
        if (!owner) return "ignored: unknown account";
        await saveAccount(tx, owner.user_id, account);
        return "account updated";
      }
      default:
        return "ignored: type";
    }
  });

  // Side effects that talk to Stripe happen after the commit and are idempotent.
  if (typeof outcome === "string" && outcome.startsWith("refund_duplicate:") && stripeMode() !== "none") {
    const pi = outcome.split(":")[1];
    if (pi && pi !== "null") await stripe().refunds.create({ payment_intent: pi }, { idempotencyKey: `refund-duplicate-${pi}` });
  }
  return { status: 200, body: { received: true, outcome } };
}
