import { type Rights, assertActive } from "./access";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { mediaUrl } from "./storage";

export type Review = {
  id: string;
  order_id: string;
  rating: number;
  body: string;
  reply: string | null;
  replied_at: Date | null;
  created_at: Date;
  author_name: string;
  author_avatar: string | null;
  order_title: string;
  service_id: string | null;
  hidden_at: Date | null;
};

/** One review per completed order, written by the buyer. Reviews cannot be bought, edited afterwards or written without an order. */
export async function writeReview(db: Db, r: Rights, orderId: string, input: { rating: number; body: string }, now = new Date()) {
  assertActive(r);
  const o = await one<{ buyer_id: string | null; seller_id: string | null; service_id: string | null; status: string }>(
    db,
    `select buyer_id, seller_id, service_id, status from orders where id::text = $1`,
    [orderId],
  );
  if (!o || o.buyer_id !== r.user.id) throw new UserError("Deze opdracht bestaat niet.");
  if (o.status !== "completed") throw new UserError("Je kunt pas een review schrijven als de opdracht is afgerond.");
  if (!o.seller_id) throw new UserError("Deze maker heeft geen account meer.");
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new UserError("Kies 1 tot 5 sterren.");
  const body = input.body.trim();
  if (body.length < 10 || body.length > 1500) throw new UserError("Schrijf 10 tot 1500 tekens over je ervaring.");
  const rows = await db.query(
    `insert into reviews (order_id, author_id, seller_id, service_id, rating, body, created_at) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (order_id) do nothing returning id`,
    [orderId, r.user.id, o.seller_id, o.service_id, input.rating, body, now],
  );
  if (!rows.length) throw new UserError("Je hebt voor deze opdracht al een review geschreven.");
}

export async function replyToReview(db: Db, r: Rights, reviewId: string, reply: string, now = new Date()) {
  assertActive(r);
  const text = reply.trim();
  if (text.length < 2 || text.length > 1000) throw new UserError("Je reactie heeft 2 tot 1000 tekens.");
  const rows = await db.query(
    `update reviews set reply = $3, replied_at = $4 where id::text = $1 and seller_id = $2 and reply is null returning id`,
    [reviewId, r.user.id, text, now],
  );
  if (!rows.length) throw new UserError("Je kunt op deze review (nog) niet reageren.");
}

export async function reviewsFor(db: Db, sellerId: string, opts: { serviceId?: string; limit?: number } = {}) {
  const rows = await db.query<Omit<Review, "author_avatar"> & { avatar_key: string | null }>(
    `select v.id, v.order_id, v.rating, v.body, v.reply, v.replied_at, v.created_at, v.service_id, v.hidden_at,
       coalesce(p.display_name, 'Voormalig lid') as author_name, av.storage_key as avatar_key, o.title as order_title
     from reviews v join orders o on o.id = v.order_id left join profiles p on p.user_id = v.author_id left join media av on av.id = p.avatar_id
     where v.seller_id = $1 and v.hidden_at is null and ($2::uuid is null or v.service_id = $2)
     order by v.created_at desc limit $3`,
    [sellerId, opts.serviceId ?? null, opts.limit ?? 50],
  );
  return rows.map(({ avatar_key, ...v }) => ({ ...v, author_avatar: mediaUrl(avatar_key) }));
}

export async function reviewForOrder(db: Db, orderId: string) {
  return one<{ id: string; rating: number; body: string; reply: string | null }>(
    db,
    `select id, rating, body, reply from reviews where order_id = $1`,
    [orderId],
  );
}
