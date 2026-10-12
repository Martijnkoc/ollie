import Stripe from "stripe";
import { beforeEach, describe, expect, it } from "vitest";
import { membershipActive, rightsFor } from "@/lib/access";
import { creditSummary } from "@/lib/billing/credits";
import { handleWebhook } from "@/lib/billing/stripe";
import type { Db } from "@/lib/db";
import { NOW, freshDb, makeUser } from "./helpers";

const SECRET = "whsec_test_contract";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;

let db: Db;
let userId: string;
beforeEach(async () => {
  db = await freshDb();
  userId = (await makeUser(db, "lid@x.nl", { profile: true })).user.id;
});

const unix = (d: Date) => Math.floor(d.getTime() / 1000);
let seq = 0;

function subscriptionEvent(type: string, over: Record<string, unknown> = {}, created = NOW) {
  const start = unix(new Date(created.getTime() - 86_400_000));
  const end = unix(new Date(created.getTime() + 29 * 86_400_000));
  return {
    id: `evt_${++seq}`,
    object: "event",
    type,
    created: unix(created),
    data: {
      object: {
        id: "sub_1",
        object: "subscription",
        customer: "cus_1",
        status: "active",
        cancel_at_period_end: false,
        cancel_at: null,
        metadata: { user_id: userId },
        items: { data: [{ current_period_start: start, current_period_end: end }] },
        ...over,
      },
    },
  };
}

function post(event: object, secret = SECRET) {
  const payload = JSON.stringify(event);
  return handleWebhook(db, payload, Stripe.webhooks.generateTestHeaderString({ payload, secret }));
}

const member = async () => (await rightsFor(db, userId, NOW)).member;

describe("Stripe webhook (contract test with signed test payloads)", () => {
  it("grants access only from a verified subscription event", async () => {
    expect(await member()).toBe(false);
    expect((await post(subscriptionEvent("customer.subscription.created"), "whsec_wrong")).status).toBe(400);
    expect((await handleWebhook(db, "{}", null)).status).toBe(400);
    expect(await member()).toBe(false);
    expect((await post(subscriptionEvent("customer.subscription.created"))).status).toBe(200);
    expect(await member()).toBe(true);
  });

  it("does not grant access on checkout completion alone", async () => {
    await post({
      id: "evt_co",
      object: "event",
      type: "checkout.session.completed",
      created: unix(NOW),
      data: { object: { client_reference_id: userId, customer: "cus_1" } },
    });
    expect(await member()).toBe(false);
  });

  it("applies a replayed event once and ignores stale ones", async () => {
    const created = subscriptionEvent("customer.subscription.created");
    await post(created);
    expect((await post(created)).body.outcome).toBe("duplicate");

    await post(subscriptionEvent("customer.subscription.updated", { status: "past_due" }, new Date(NOW.getTime() + 60_000)));
    const stale = await post(subscriptionEvent("customer.subscription.updated", { status: "unpaid" }, new Date(NOW.getTime() - 60_000)));
    expect(stale.body.outcome).toBe("ignored: stale");
    const [m] = await db.query<{ status: string }>(`select status from memberships where user_id = $1`, [userId]);
    expect(m.status).toBe("past_due");
    expect(await member()).toBe(true); // Stripe is retrying the payment
  });

  it("keeps access until the end of a cancelled period, then removes it", async () => {
    await post(subscriptionEvent("customer.subscription.created"));
    await post(subscriptionEvent("customer.subscription.updated", { cancel_at_period_end: true }, new Date(NOW.getTime() + 1000)));
    expect(await member()).toBe(true);
    await post(subscriptionEvent("customer.subscription.deleted", { status: "canceled" }, new Date(NOW.getTime() + 2000)));
    expect(await member()).toBe(false);
  });

  it("removes access for unpaid subscriptions and after the period ends without renewal", async () => {
    await post(subscriptionEvent("customer.subscription.updated", { status: "unpaid" }));
    expect(await member()).toBe(false);
    const m = { status: "active", current_period_end: new Date(NOW.getTime() - 49 * 3_600_000) } as Parameters<typeof membershipActive>[0];
    expect(membershipActive(m, NOW)).toBe(false);
  });

  it("refuses everything when the webhook secret is missing", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await post(subscriptionEvent("customer.subscription.created"))).status).toBe(503);
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });

  it("reports the quota of an active member", async () => {
    await post(subscriptionEvent("customer.subscription.created"));
    expect(await creditSummary(db, userId, NOW)).toMatchObject({ active: true, quota: 5, used: 0, available: 5 });
  });
});
