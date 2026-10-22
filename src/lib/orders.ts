import { type Rights, assertActive, isPublic, profileOf } from "./access";
import { assertNotBlocked } from "./blocks";
import { AUTO_COMPLETE_DAYS, OVERDUE_GRACE_DAYS, PLATFORM_FEE_BPS, QUOTE_VALID_DAYS, TERMS_VERSION } from "./config";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { ensureThread } from "./messages";
import { assertPrice, parseEuro, split } from "./money";
import { limit } from "./ratelimit";
import { getService } from "./services";

export type OrderStatus =
  | "requested"
  | "quoted"
  | "awaiting_payment"
  | "in_progress"
  | "delivered"
  | "completed"
  | "declined"
  | "withdrawn"
  | "cancelled"
  | "disputed";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  requested: "Aangevraagd",
  quoted: "Offerte verstuurd",
  awaiting_payment: "Wacht op betaling",
  in_progress: "In uitvoering",
  delivered: "Opgeleverd",
  completed: "Afgerond",
  declined: "Afgewezen",
  withdrawn: "Ingetrokken",
  cancelled: "Geannuleerd",
  disputed: "Klacht in behandeling",
};

/** Statuses in which no money has moved: either side may still walk away. */
const UNPAID: OrderStatus[] = ["requested", "quoted", "awaiting_payment"];
export const OPEN: OrderStatus[] = ["requested", "quoted", "awaiting_payment", "in_progress", "delivered", "disputed"];

export type Order = {
  id: string;
  ref: number;
  kind: "fixed" | "custom";
  buyer_id: string | null;
  seller_id: string | null;
  service_id: string | null;
  title: string;
  brief: string;
  budget_cents: number | null;
  desired_by: string | null;
  location: string;
  extras: { title: string; price_cents: number; extra_days: number }[];
  price_cents: number | null;
  delivery_days: number | null;
  fee_bps: number | null;
  fee_cents: number | null;
  seller_amount_cents: number | null;
  status: OrderStatus;
  payment_status: "none" | "paid" | "refund_pending" | "refunded";
  transfer_status: "none" | "pending" | "sent" | "failed";
  terms_accepted_at: Date | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_transfer_id: string | null;
  paid_at: Date | null;
  due_at: Date | null;
  delivered_at: Date | null;
  delivery_note: string | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  cancel_requested_by: string | null;
  cancel_requested_at: Date | null;
  disputed_at: Date | null;
  dispute_reason: string | null;
  created_at: Date;
  updated_at: Date;
  buyer_name: string;
  seller_name: string;
  seller_username: string | null;
};

export type Quote = {
  id: string;
  order_id: string;
  price_cents: number;
  delivery_days: number;
  message: string;
  valid_until: Date;
  status: string;
  created_at: Date;
};

const ORDER_SELECT = `o.*, o.desired_by::text as desired_by, coalesce(bp.display_name, 'Voormalig lid') as buyer_name,
  coalesce(sp.display_name, 'Voormalig lid') as seller_name, sp.username as seller_username
  from orders o left join profiles bp on bp.user_id = o.buyer_id left join profiles sp on sp.user_id = o.seller_id`;

async function event(db: Db, orderId: string, actorId: string | null, kind: string, note = "", now = new Date()) {
  await db.query(`insert into order_events (order_id, actor_id, kind, note, created_at) values ($1, $2, $3, $4, $5)`, [
    orderId,
    actorId,
    kind,
    note,
    now,
  ]);
}

function cleanText(value: string | undefined, max: number, what: string, min = 0) {
  const v = (value ?? "").trim();
  if (v.length < min) throw new UserError(`${what} heeft minimaal ${min} tekens.`);
  if (v.length > max) throw new UserError(`${what} heeft maximaal ${max} tekens.`);
  return v;
}

function requireTerms(accepted: boolean) {
  if (!accepted) throw new UserError("Bevestig dat je akkoord gaat met de voorwaarden en de betaalverplichting.");
}

/** Buyer, seller or staff. Anyone else gets nothing, not even whether the order exists. */
export async function getOrder(db: Db, r: Rights, orderId: string) {
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return undefined;
  const o = await one<Order>(db, `select ${ORDER_SELECT} where o.id = $1`, [orderId]);
  if (!o) return undefined;
  if (o.buyer_id !== r.user.id && o.seller_id !== r.user.id && !r.staff) return undefined;
  return o;
}

async function lockOrder(tx: Db, orderId: string) {
  const o = await one<Order>(tx, `select o.*, o.desired_by::text as desired_by from orders o where o.id::text = $1 for update`, [orderId]);
  if (!o) throw new UserError("Deze opdracht bestaat niet.");
  return o;
}

function roleIn(o: Pick<Order, "buyer_id" | "seller_id">, userId: string) {
  return o.buyer_id === userId ? "buyer" : o.seller_id === userId ? "seller" : null;
}

export async function ordersFor(db: Db, userId: string, role: "buyer" | "seller") {
  return db.query<Order>(
    `select ${ORDER_SELECT} where o.${role === "buyer" ? "buyer_id" : "seller_id"} = $1 order by o.updated_at desc limit 200`,
    [userId],
  );
}

export async function quotesFor(db: Db, orderId: string) {
  return db.query<Quote>(`select * from quotes where order_id = $1 order by (status = 'open') desc, created_at desc`, [orderId]);
}

export async function eventsFor(db: Db, orderId: string) {
  return db.query<{ id: number; kind: string; note: string; created_at: Date; actor_name: string | null; actor_id: string | null }>(
    `select e.id::int as id, e.kind, e.note, e.created_at, e.actor_id, p.display_name as actor_name
     from order_events e left join profiles p on p.user_id = e.actor_id where e.order_id = $1 order by e.id`,
    [orderId],
  );
}

/* ---------- Fixed price: order directly ---------- */

export async function createFixedOrder(
  db: Db,
  r: Rights,
  input: { serviceId: string; extraIds: string[]; brief: string; location: string; acceptTerms: boolean },
  now = new Date(),
) {
  assertActive(r);
  const service = await getService(db, input.serviceId, r.user.id);
  if (!service || !service.visible) throw new UserError("Deze dienst is niet beschikbaar.");
  if (service.owner_id === r.user.id) throw new UserError("Je kunt je eigen dienst niet bestellen.");
  if (service.kind !== "fixed" || service.price_cents == null || service.delivery_days == null) {
    throw new UserError("Voor deze dienst stuur je eerst een aanvraag; de maker maakt dan een offerte.");
  }
  await assertNotBlocked(db, r.user.id, service.owner_id);
  const chosen = service.extras.filter((e) => input.extraIds.includes(e.id));
  if (chosen.length !== new Set(input.extraIds).size) throw new UserError("Een gekozen uitbreiding bestaat niet meer. Kijk je keuze na.");
  const brief = cleanText(input.brief, 3000, "Je toelichting");
  const location = cleanText(input.location, 120, "De locatie");
  if (service.location_mode === "on_site" && !location) throw new UserError("Vul in waar de opdracht plaatsvindt.");
  requireTerms(input.acceptTerms);
  await limit(db, "orders", r.user.id, now);

  const price = service.price_cents + chosen.reduce((sum, e) => sum + e.price_cents, 0);
  const days = service.delivery_days + chosen.reduce((sum, e) => sum + e.extra_days, 0);
  const s = split(price);
  const id = await db.transaction(async (tx) => {
    const row = await one<{ id: string }>(
      tx,
      `insert into orders (kind, buyer_id, seller_id, service_id, title, brief, location, extras, price_cents, delivery_days, fee_bps, fee_cents,
         seller_amount_cents, status, terms_accepted_at, terms_version, created_at, updated_at)
       values ('fixed', $1, $2, $3, $4, $5, $6, $7::text::jsonb, $8, $9, $10, $11, $12, 'awaiting_payment', $13, $14, $13, $13) returning id`,
      [
        r.user.id,
        service.owner_id,
        service.id,
        service.title,
        brief,
        location,
        JSON.stringify(chosen.map((e) => ({ title: e.title, price_cents: e.price_cents, extra_days: e.extra_days }))),
        price,
        days,
        s.feeBps,
        s.fee,
        s.seller,
        now,
        TERMS_VERSION,
      ],
    );
    await event(tx, row!.id, r.user.id, "ordered", "", now);
    await ensureThread(tx, r.user.id, service.owner_id, now);
    return row!.id;
  });
  return id;
}

/* ---------- Custom work: request → quote → accept ---------- */

export async function createRequest(
  db: Db,
  r: Rights,
  input: { sellerId: string; serviceId?: string; title: string; brief: string; budget: string; desiredBy: string; location: string },
  now = new Date(),
) {
  assertActive(r);
  if (input.sellerId === r.user.id) throw new UserError("Je kunt jezelf geen aanvraag sturen.");
  const seller = await profileOf(db, input.sellerId);
  const sellerUser = await one<{ restricted_at: Date | null }>(db, `select restricted_at from users where id = $1`, [input.sellerId]);
  if (!isPublic(seller) || sellerUser?.restricted_at) throw new UserError("Deze maker is niet beschikbaar.");
  if (seller!.availability === "unavailable") throw new UserError(`${seller!.display_name} neemt nu geen opdrachten aan.`);
  await assertNotBlocked(db, r.user.id, input.sellerId);
  let serviceId: string | null = null;
  if (input.serviceId) {
    const service = await getService(db, input.serviceId, r.user.id);
    if (!service || !service.visible || service.owner_id !== input.sellerId) throw new UserError("Deze dienst is niet beschikbaar.");
    serviceId = service.id;
  }
  const title = cleanText(input.title, 80, "De titel", 5);
  const brief = cleanText(input.brief, 3000, "Je omschrijving", 20);
  const budget = parseEuro(input.budget);
  if (budget != null) assertPrice(budget, "Je budget");
  let desiredBy: string | null = null;
  if (input.desiredBy) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.desiredBy)) throw new UserError("Kies een geldige datum.");
    if (new Date(`${input.desiredBy}T23:59:59Z`).getTime() < now.getTime()) throw new UserError("Kies een datum in de toekomst.");
    desiredBy = input.desiredBy;
  }
  const location = cleanText(input.location, 120, "De locatie");
  await limit(db, "orders", r.user.id, now);
  return db.transaction(async (tx) => {
    const row = await one<{ id: string }>(
      tx,
      `insert into orders (kind, buyer_id, seller_id, service_id, title, brief, budget_cents, desired_by, location, status, created_at, updated_at)
       values ('custom', $1, $2, $3, $4, $5, $6, $7, $8, 'requested', $9, $9) returning id`,
      [r.user.id, input.sellerId, serviceId, title, brief, budget, desiredBy, location, now],
    );
    await event(tx, row!.id, r.user.id, "requested", "", now);
    await ensureThread(tx, r.user.id, input.sellerId, now);
    return row!.id;
  });
}

export async function sendQuote(
  db: Db,
  r: Rights,
  orderId: string,
  input: { price: string; deliveryDays: string; message: string },
  now = new Date(),
) {
  assertActive(r);
  const price = assertPrice(parseEuro(input.price));
  const days = Number(input.deliveryDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new UserError("Vul een levertijd in van 1 tot 365 dagen.");
  const message = cleanText(input.message, 2000, "Je toelichting");
  await limit(db, "quotes", r.user.id, now);
  await db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.seller_id !== r.user.id) throw new UserError("Deze opdracht bestaat niet.");
    if (o.status !== "requested" && o.status !== "quoted") throw new UserError("Voor deze opdracht kun je geen offerte meer sturen.");
    if (o.buyer_id) await assertNotBlocked(tx, r.user.id, o.buyer_id);
    await tx.query(`update quotes set status = 'superseded', responded_at = $2 where order_id = $1 and status = 'open'`, [orderId, now]);
    await tx.query(
      `insert into quotes (order_id, price_cents, delivery_days, message, valid_until, created_at) values ($1, $2, $3, $4, $5, $6)`,
      [orderId, price, days, message, new Date(now.getTime() + QUOTE_VALID_DAYS * 86_400_000), now],
    );
    await tx.query(`update orders set status = 'quoted', updated_at = $2 where id = $1`, [orderId, now]);
    await event(tx, orderId, r.user.id, "quoted", "", now);
  });
}

/** Accepting a quote is the moment the agreement is made, so it needs the explicit confirmation. */
export async function acceptQuote(db: Db, r: Rights, orderId: string, quoteId: string, acceptTerms: boolean, now = new Date()) {
  assertActive(r);
  requireTerms(acceptTerms);
  await db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.buyer_id !== r.user.id) throw new UserError("Deze opdracht bestaat niet.");
    if (o.status !== "quoted") throw new UserError("Er staat geen offerte open.");
    if (o.seller_id) await assertNotBlocked(tx, r.user.id, o.seller_id);
    const q = await one<Quote>(tx, `select * from quotes where id::text = $1 and order_id = $2 and status = 'open' for update`, [
      quoteId,
      orderId,
    ]);
    if (!q) throw new UserError("Deze offerte is niet meer geldig. Vernieuw de pagina.");
    if (q.valid_until.getTime() < now.getTime()) {
      await tx.query(`update quotes set status = 'expired' where id = $1`, [q.id]);
      throw new UserError("Deze offerte is verlopen. Vraag de maker om een nieuwe.");
    }
    const s = split(q.price_cents, PLATFORM_FEE_BPS);
    await tx.query(`update quotes set status = 'accepted', responded_at = $2 where id = $1`, [q.id, now]);
    await tx.query(
      `update orders set status = 'awaiting_payment', price_cents = $2, delivery_days = $3, fee_bps = $4, fee_cents = $5,
         seller_amount_cents = $6, terms_accepted_at = $7, terms_version = $8, updated_at = $7 where id = $1`,
      [orderId, s.price, q.delivery_days, s.feeBps, s.fee, s.seller, now, TERMS_VERSION],
    );
    await event(tx, orderId, r.user.id, "quote_accepted", "", now);
  });
}

export async function declineQuote(db: Db, r: Rights, orderId: string, quoteId: string, now = new Date()) {
  assertActive(r);
  await db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.buyer_id !== r.user.id) throw new UserError("Deze opdracht bestaat niet.");
    const rows = await tx.query(
      `update quotes set status = 'declined', responded_at = $3 where id::text = $1 and order_id = $2 and status = 'open' returning id`,
      [quoteId, orderId, now],
    );
    if (!rows.length) throw new UserError("Deze offerte staat niet meer open.");
    await tx.query(`update orders set status = 'requested', updated_at = $2 where id = $1`, [orderId, now]);
    await event(tx, orderId, r.user.id, "quote_declined", "", now);
  });
}

/** Before payment either side can step out: the seller declines, the buyer withdraws. */
export async function stepOut(db: Db, r: Rights, orderId: string, reason: string, now = new Date()) {
  if (r.restricted) throw new UserError("Je account is beperkt.");
  const note = cleanText(reason, 500, "De toelichting");
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    const role = roleIn(o, r.user.id);
    if (!role) throw new UserError("Deze opdracht bestaat niet.");
    if (!UNPAID.includes(o.status) || o.payment_status !== "none")
      throw new UserError("Deze opdracht is al betaald. Annuleren gaat via een terugbetaling.");
    const status = role === "seller" ? "declined" : "withdrawn";
    await tx.query(`update quotes set status = 'withdrawn', responded_at = $2 where order_id = $1 and status = 'open'`, [orderId, now]);
    await tx.query(
      `update orders set status = $2, cancelled_at = $3, cancelled_by = $4, cancel_reason = $5, updated_at = $3 where id = $1`,
      [orderId, status, now, r.user.id, note || null],
    );
    await event(tx, orderId, r.user.id, status, note, now);
    return { status, checkoutSession: o.stripe_checkout_session_id };
  });
}

/* ---------- After payment ---------- */

export async function deliver(db: Db, r: Rights, orderId: string, note: string, now = new Date()) {
  if (r.restricted) throw new UserError("Je account is beperkt.");
  const text = cleanText(note, 2000, "Je opleverbericht", 5);
  await db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.seller_id !== r.user.id) throw new UserError("Deze opdracht bestaat niet.");
    if (o.status !== "in_progress") throw new UserError("Deze opdracht kun je nu niet opleveren.");
    await tx.query(
      `update orders set status = 'delivered', delivered_at = $2, delivery_note = $3, cancel_requested_by = null, cancel_requested_at = null,
         updated_at = $2 where id = $1`,
      [orderId, now, text],
    );
    await event(tx, orderId, r.user.id, "delivered", text, now);
  });
}

export async function requestChanges(db: Db, r: Rights, orderId: string, note: string, now = new Date()) {
  if (r.restricted) throw new UserError("Je account is beperkt.");
  const text = cleanText(note, 2000, "Je toelichting", 10);
  await db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.buyer_id !== r.user.id) throw new UserError("Deze opdracht bestaat niet.");
    if (o.status !== "delivered") throw new UserError("Je kunt alleen om aanpassingen vragen na een oplevering.");
    await tx.query(`update orders set status = 'in_progress', updated_at = $2 where id = $1`, [orderId, now]);
    await event(tx, orderId, r.user.id, "changes_requested", text, now);
  });
}

/** The buyer accepts the delivery. Releasing the money to the maker follows (see payments.releaseFunds). */
export async function complete(db: Db, r: Rights | null, orderId: string, now = new Date()) {
  if (r?.restricted) throw new UserError("Je account is beperkt.");
  await db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (r && o.buyer_id !== r.user.id) throw new UserError("Deze opdracht bestaat niet.");
    if (o.status !== "delivered") throw new UserError("Deze opdracht kun je nu niet afronden.");
    await completeLocked(tx, o, r?.user.id ?? null, r ? "completed" : "auto_completed", "", now);
  });
}

async function completeLocked(tx: Db, o: Order, actorId: string | null, kind: string, note: string, now: Date) {
  await tx.query(
    `update orders set status = 'completed', completed_at = $2, transfer_status = case when payment_status = 'paid' then 'pending' else transfer_status end,
       updated_at = $2 where id = $1`,
    [o.id, now],
  );
  await event(tx, o.id, actorId, kind, note, now);
}

/** The buyer asks to cancel a paid order; the seller agrees (refund) or the buyer brings it to a moderator. */
export async function requestCancel(db: Db, r: Rights, orderId: string, reason: string, now = new Date()) {
  if (r.restricted) throw new UserError("Je account is beperkt.");
  const text = cleanText(reason, 1000, "Je reden", 5);
  await db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.buyer_id !== r.user.id) throw new UserError("Deze opdracht bestaat niet.");
    if (o.status !== "in_progress" && o.status !== "delivered") throw new UserError("Deze opdracht kun je nu niet annuleren.");
    if (o.cancel_requested_at) throw new UserError("Je hebt al gevraagd om te annuleren.");
    await tx.query(
      `update orders set cancel_requested_by = $2, cancel_requested_at = $3, cancel_reason = $4, updated_at = $3 where id = $1`,
      [orderId, r.user.id, now, text],
    );
    await event(tx, orderId, r.user.id, "cancel_requested", text, now);
  });
}

/**
 * Who may cancel a paid order with a full refund right now:
 * the seller, always (before completion); the buyer, once delivery is clearly overdue.
 */
export function mayCancelWithRefund(o: Order, userId: string, now = new Date()) {
  if (o.payment_status !== "paid" || !["in_progress", "delivered"].includes(o.status)) return false;
  if (o.seller_id === userId) return true;
  const overdue = o.status === "in_progress" && o.due_at && now.getTime() > o.due_at.getTime() + OVERDUE_GRACE_DAYS * 86_400_000;
  return o.buyer_id === userId && Boolean(overdue);
}

export async function openComplaint(db: Db, r: Rights, orderId: string, reason: string, now = new Date()) {
  const text = cleanText(reason, 2000, "Je toelichting", 20);
  await db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (!roleIn(o, r.user.id)) throw new UserError("Deze opdracht bestaat niet.");
    if (o.status !== "in_progress" && o.status !== "delivered") throw new UserError("Voor deze opdracht kun je nu geen klacht indienen.");
    await tx.query(`update orders set status = 'disputed', disputed_at = $2, dispute_reason = $3, updated_at = $2 where id = $1`, [
      orderId,
      now,
      text,
    ]);
    await event(tx, orderId, r.user.id, "disputed", text, now);
  });
}

/** Time-based transitions, run by the daily sweep. */
export async function autoTransitions(db: Db, now = new Date()) {
  const expired = await db.query<{ order_id: string }>(
    `update quotes set status = 'expired' where status = 'open' and valid_until < $1 returning order_id`,
    [now],
  );
  for (const q of expired) {
    await db.query(`update orders set status = 'requested', updated_at = $2 where id = $1 and status = 'quoted'`, [q.order_id, now]);
    await event(db, q.order_id, null, "quote_expired", "", now);
  }
  const due = await db.query<{ id: string }>(`select id from orders where status = 'delivered' and delivered_at < $1 limit 200`, [
    new Date(now.getTime() - AUTO_COMPLETE_DAYS * 86_400_000),
  ]);
  for (const d of due) {
    await db.transaction(async (tx) => {
      const o = await lockOrder(tx, d.id);
      if (o.status === "delivered") await completeLocked(tx, o, null, "auto_completed", "", now);
    });
  }
  return { expiredQuotes: expired.length, autoCompleted: due.length };
}

/** Recorded by payments when Stripe confirms a refund was created; never by the client. */
export async function markCancelledWithRefund(
  tx: Db,
  orderId: string,
  actorId: string | null,
  reason: string,
  refundId: string,
  now = new Date(),
) {
  await tx.query(
    `update orders set status = 'cancelled', payment_status = 'refund_pending', stripe_refund_id = $2, cancelled_at = $3, cancelled_by = $4,
       cancel_reason = coalesce($5, cancel_reason), updated_at = $3 where id = $1`,
    [orderId, refundId, now, actorId, reason || null],
  );
  await event(tx, orderId, actorId, "refunded", reason, now);
}

export { completeLocked, event as orderEvent, lockOrder };
