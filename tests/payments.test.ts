import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";

// A stand-in for the Stripe API client; webhook signatures are real (Stripe's own helper).
const api = {
  transfers: { create: vi.fn(async () => ({ id: "tr_test_1" })) },
  refunds: { create: vi.fn(async () => ({ id: "re_test_1" })) },
  paymentIntents: { retrieve: vi.fn(async () => ({ latest_charge: "ch_test_1" })) },
};
let mode: "test" | "none" = "test";
vi.mock("@/lib/payments-client", () => ({
  stripeMode: () => mode,
  stripe: () => {
    if (mode === "none") throw new Error("not configured");
    return api;
  },
}));

const { handleWebhook, refundOrder, releaseFunds, resolveDispute } = await import("@/lib/payments");
const { createFixedOrder, deliver, complete, getOrder, openComplaint, stepOut } = await import("@/lib/orders");
const { saveService, getService } = await import("@/lib/services");
const { rightsFor } = await import("@/lib/access");
const { NOW, days, freshDb, makeUser, service } = await import("./helpers");

const SECRET = "whsec_unit";
let db: Db;
beforeEach(async () => {
  db = await freshDb();
  mode = "test";
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  vi.clearAllMocks();
});
afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

let n = 0;
function signed(type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({ id: `evt_${++n}`, object: "event", type, created: 1_800_000_000 + n, data: { object } });
  return { payload, signature: Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) };
}
const session = (orderId: string, amount: number, pi = "pi_1") => ({
  id: `cs_${n}`,
  object: "checkout.session",
  amount_total: amount,
  currency: "eur",
  payment_status: "paid",
  payment_intent: pi,
  metadata: { order_id: orderId },
});

async function setup() {
  const maker = await makeUser(db, "Mila", { maker: true });
  const buyer = await makeUser(db, "Bas");
  const id = await saveService(db, maker, service() as never, undefined, NOW);
  const s = (await getService(db, id))!;
  const orderId = await createFixedOrder(db, buyer, { serviceId: s.id, extraIds: [], brief: "", location: "x", acceptTerms: true }, NOW);
  await db.query(
    `insert into payout_accounts (user_id, stripe_account_id, details_submitted, payouts_enabled, transfers_active) values ($1, 'acct_mila', true, true, true)`,
    [maker.user.id],
  );
  return { maker, buyer, orderId };
}

describe("Stripe webhook", () => {
  it("refuses unsigned, wrongly signed and unconfigured calls", async () => {
    expect((await handleWebhook(db, "{}", null)).status).toBe(400);
    expect((await handleWebhook(db, "{}", "t=1,v1=nep")).status).toBe(400);
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await handleWebhook(db, "{}", "t=1,v1=nep")).status).toBe(503);
  });

  it("marks paid only for the agreed amount, once, and sets the due date", async () => {
    const { buyer, orderId } = await setup();
    const wrong = signed("checkout.session.completed", session(orderId, 100));
    expect((await handleWebhook(db, wrong.payload, wrong.signature, NOW)).body.outcome).toBe("flagged: amount mismatch");
    expect((await getOrder(db, buyer, orderId))!.status).toBe("awaiting_payment");

    const ok = signed("checkout.session.completed", session(orderId, 15_000));
    expect((await handleWebhook(db, ok.payload, ok.signature, NOW)).body.outcome).toBe(`paid:${orderId}`);
    expect((await handleWebhook(db, ok.payload, ok.signature, NOW)).body.outcome).toBe("duplicate");
    const o = (await getOrder(db, buyer, orderId))!;
    expect(o).toMatchObject({ status: "in_progress", payment_status: "paid", stripe_charge_id: "ch_test_1" });
    expect(o.due_at).toEqual(days(7));
  });

  it("does not start work for an unpaid (async) session, and flags a payment after cancelling for a refund", async () => {
    const { buyer, orderId } = await setup();
    const pending = signed("checkout.session.completed", { ...session(orderId, 15_000), payment_status: "unpaid" });
    expect((await handleWebhook(db, pending.payload, pending.signature, NOW)).body.outcome).toBe("pending: not paid yet");
    await stepOut(db, buyer, orderId, "", NOW);
    const late = signed("checkout.session.async_payment_succeeded", session(orderId, 15_000));
    expect((await handleWebhook(db, late.payload, late.signature, NOW)).body.outcome).toBe("flagged: paid after cancel");
    expect((await getOrder(db, buyer, orderId))!).toMatchObject({ status: "disputed", payment_status: "paid" });
  });

  it("refunds a second payment for the same order automatically", async () => {
    const { orderId } = await setup();
    const first = signed("checkout.session.completed", session(orderId, 15_000, "pi_a"));
    await handleWebhook(db, first.payload, first.signature, NOW);
    const second = signed("checkout.session.completed", session(orderId, 15_000, "pi_b"));
    expect((await handleWebhook(db, second.payload, second.signature, NOW)).body.outcome).toBe("refund_duplicate:pi_b");
    expect(api.refunds.create).toHaveBeenCalledWith({ payment_intent: "pi_b" }, { idempotencyKey: "refund-duplicate-pi_b" });
  });

  it("keeps payout accounts current from account.updated and records refunds", async () => {
    const { maker, buyer, orderId } = await setup();
    await db.query(`update payout_accounts set transfers_active = false, payouts_enabled = false where user_id = $1`, [maker.user.id]);
    const acct = signed("account.updated", {
      id: "acct_mila",
      object: "account",
      details_submitted: true,
      payouts_enabled: true,
      capabilities: { transfers: "active" },
      requirements: { currently_due: [] },
    });
    await handleWebhook(db, acct.payload, acct.signature, NOW);
    const [a] = await db.query<{ transfers_active: boolean }>(`select transfers_active from payout_accounts where user_id = $1`, [
      maker.user.id,
    ]);
    expect(a.transfers_active).toBe(true);

    const paid = signed("checkout.session.completed", session(orderId, 15_000));
    await handleWebhook(db, paid.payload, paid.signature, NOW);
    await refundOrder(db, maker, orderId, "Ziek", {}, NOW);
    const refunded = signed("charge.refunded", { id: "ch_test_1", object: "charge", payment_intent: "pi_1", refunded: true });
    await handleWebhook(db, refunded.payload, refunded.signature, NOW);
    expect((await getOrder(db, buyer, orderId))!).toMatchObject({ status: "cancelled", payment_status: "refunded" });
  });
});

describe("money movements", () => {
  async function paidOrder() {
    const ctx = await setup();
    const ok = signed("checkout.session.completed", session(ctx.orderId, 15_000));
    await handleWebhook(db, ok.payload, ok.signature, NOW);
    return ctx;
  }

  it("pays the maker the price minus the fee, once, tied to the charge", async () => {
    const { maker, buyer, orderId } = await paidOrder();
    expect(await releaseFunds(db, orderId, NOW)).toBe("skipped");
    await deliver(db, maker, orderId, "Klaar!", NOW);
    await complete(db, buyer, orderId, NOW);
    expect(await releaseFunds(db, orderId, NOW)).toBe("sent");
    expect(api.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 13_500, currency: "eur", destination: "acct_mila", source_transaction: "ch_test_1" }),
      { idempotencyKey: `transfer-${orderId}` },
    );
    expect(await releaseFunds(db, orderId, NOW)).toBe("skipped");
    expect(api.transfers.create).toHaveBeenCalledTimes(1);
  });

  it("waits (never pretends) when Stripe is not configured", async () => {
    const { maker, buyer, orderId } = await paidOrder();
    await deliver(db, maker, orderId, "Klaar!", NOW);
    await complete(db, buyer, orderId, NOW);
    mode = "none";
    expect(await releaseFunds(db, orderId, NOW)).toBe("waiting");
    expect((await getOrder(db, buyer, orderId))!.transfer_status).toBe("pending");
  });

  it("lets the buyer cancel with a refund only when delivery is overdue; never after payout", async () => {
    const { buyer, orderId } = await paidOrder();
    await expect(refundOrder(db, buyer, orderId, "", {}, days(3))).rejects.toThrow("nu niet annuleren");
    await refundOrder(db, buyer, orderId, "Niets gehoord", {}, days(10));
    expect(api.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_1", metadata: { order_id: orderId } },
      { idempotencyKey: `refund-${orderId}` },
    );
    expect((await getOrder(db, buyer, orderId))!).toMatchObject({ status: "cancelled", payment_status: "refund_pending" });
  });

  it("resolves complaints only by staff, with a reason, and logs it", async () => {
    const { maker, buyer, orderId } = await paidOrder();
    await openComplaint(db, buyer, orderId, "Na drie weken nog steeds geen foto's ontvangen.", NOW);
    await expect(resolveDispute(db, maker, orderId, "release", "Ik heb het gedaan", NOW)).rejects.toThrow("moderatoren");
    const [{ id }] = await db.query<{ id: string }>(`insert into users (email) values ('ada@test.nl') returning id`);
    await db.query(`insert into roles (user_id, role) values ($1, 'moderator')`, [id]);
    const ada = await rightsFor(db, id);
    await expect(resolveDispute(db, ada, orderId, "refund", "", NOW)).rejects.toThrow("toelichting");
    await resolveDispute(db, ada, orderId, "refund", "Geen oplevering aangetoond.", NOW);
    expect((await getOrder(db, buyer, orderId))!.status).toBe("cancelled");
    const [log] = await db.query<{ action: string }>(`select action from moderation_actions`);
    expect(log.action).toBe("dispute_refund");
  });
});
