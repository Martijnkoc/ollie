import { type Rights, assertActive, isPublic, profileOf } from "./access";
import { assertNotBlocked, blockedEitherWay } from "./blocks";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { limit } from "./ratelimit";
import { mediaUrl } from "./storage";

export type Thread = {
  id: string;
  other_id: string | null;
  other_name: string;
  other_username: string | null;
  other_avatar: string | null;
  last_at: Date | null;
  last_body: string | null;
  unread: number;
  blocked: boolean;
};
export type Message = { id: number; author_id: string; body: string; created_at: Date; mine: boolean; order_ref: number | null };

const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);

export async function ensureThread(db: Db, x: string, y: string, now = new Date()) {
  const [a, b] = pair(x, y);
  const row = await one<{ id: string }>(
    db,
    `insert into threads (user_a, user_b, created_at) values ($1, $2, $3) on conflict (user_a, user_b) do update set user_a = excluded.user_a returning id`,
    [a, b, now],
  );
  return row!.id;
}

export async function threadBetween(db: Db, x: string, y: string) {
  const [a, b] = pair(x, y);
  return (await one<{ id: string }>(db, `select id from threads where user_a = $1 and user_b = $2`, [a, b]))?.id;
}

/**
 * Anyone with a profile can write to a maker with a public profile. A maker can answer everyone who wrote
 * to them or ordered from them, because that creates the thread. Cold messages to buyers are not possible.
 */
export async function startConversation(db: Db, r: Rights, toUserId: string, body: string, now = new Date()) {
  assertActive(r);
  if (toUserId === r.user.id) throw new UserError("Je kunt jezelf geen bericht sturen.");
  const existing = await threadBetween(db, r.user.id, toUserId);
  if (!existing) {
    const target = await profileOf(db, toUserId);
    const user = await one<{ restricted_at: Date | null }>(db, `select restricted_at from users where id = $1`, [toUserId]);
    if (!isPublic(target) || user?.restricted_at) throw new UserError("Deze persoon is niet bereikbaar.");
    await assertNotBlocked(db, r.user.id, toUserId);
    await limit(db, "newThreads", r.user.id, now);
  }
  const id = existing ?? (await ensureThread(db, r.user.id, toUserId, now));
  await postMessage(db, r, id, body, null, now);
  return id;
}

/** The thread, but only for one of its two members. Anyone else gets nothing. */
export async function getThread(db: Db, r: Rights, threadId: string) {
  if (!/^[0-9a-f-]{36}$/.test(threadId)) return undefined;
  const t = await one<{ id: string; user_a: string; user_b: string }>(db, `select id, user_a, user_b from threads where id = $1`, [
    threadId,
  ]);
  if (!t || (t.user_a !== r.user.id && t.user_b !== r.user.id)) return undefined;
  const otherId = t.user_a === r.user.id ? t.user_b : t.user_a;
  const other = await profileOf(db, otherId);
  return {
    id: t.id,
    otherId,
    otherName: other?.display_name ?? "Voormalig lid",
    otherUsername: other && isPublic(other) ? other.username : null,
    otherAvatar: other?.avatar_url ?? null,
    blocked: await blockedEitherWay(db, r.user.id, otherId),
  };
}

export async function threadsFor(db: Db, r: Rights) {
  const rows = await db.query<Omit<Thread, "other_avatar"> & { avatar_key: string | null; published: boolean; hidden: boolean }>(
    `select t.id, o.user_id as other_id, coalesce(o.display_name, 'Voormalig lid') as other_name, o.username as other_username,
       av.storage_key as avatar_key, coalesce(o.published, false) as published, (o.hidden_at is not null) as hidden, t.last_message_at as last_at,
       (select body from thread_messages m where m.thread_id = t.id and m.deleted_at is null order by m.id desc limit 1) as last_body,
       (select count(*)::int from thread_messages m where m.thread_id = t.id and m.author_id <> $1
          and m.id > coalesce((select last_read_id from thread_reads tr where tr.thread_id = t.id and tr.user_id = $1), 0)) as unread,
       exists (select 1 from blocks b where (b.blocker_id = $1 and b.blocked_id = o.user_id) or (b.blocker_id = o.user_id and b.blocked_id = $1)) as blocked
     from threads t
     left join profiles o on o.user_id = case when t.user_a = $1 then t.user_b else t.user_a end
     left join media av on av.id = o.avatar_id
     where (t.user_a = $1 or t.user_b = $1) and t.last_message_at is not null
     order by t.last_message_at desc`,
    [r.user.id],
  );
  return rows.map(({ avatar_key, published, hidden, ...t }) => ({
    ...t,
    other_username: published && !hidden ? t.other_username : null,
    other_avatar: mediaUrl(avatar_key),
  }));
}

export async function unreadCount(db: Db, userId: string) {
  const row = await one<{ n: number }>(
    db,
    `select count(*)::int as n from thread_messages m join threads t on t.id = m.thread_id
     where (t.user_a = $1 or t.user_b = $1) and m.author_id <> $1 and m.deleted_at is null
       and m.id > coalesce((select last_read_id from thread_reads tr where tr.thread_id = t.id and tr.user_id = $1), 0)`,
    [userId],
  );
  return row?.n ?? 0;
}

export async function markRead(db: Db, userId: string, threadId: string, lastId: number) {
  await db.query(
    `insert into thread_reads (thread_id, user_id, last_read_id) values ($1, $2, $3)
     on conflict (thread_id, user_id) do update set last_read_id = greatest(thread_reads.last_read_id, excluded.last_read_id)`,
    [threadId, userId, lastId],
  );
}

export async function threadMessages(db: Db, r: Rights, threadId: string, opts: { before?: number; after?: number } = {}) {
  const t = await getThread(db, r, threadId);
  if (!t) throw new UserError("Dit gesprek bestaat niet.");
  const rows = await db.query<Omit<Message, "mine">>(
    `select m.id::int as id, m.author_id, m.body, m.created_at, o.ref::int as order_ref from thread_messages m left join orders o on o.id = m.order_id
     where m.thread_id = $1 and m.deleted_at is null and ($2::bigint is null or m.id < $2) and ($3::bigint is null or m.id > $3)
     order by m.id ${opts.after ? "asc" : "desc"} limit 50`,
    [threadId, opts.before ?? null, opts.after ?? null],
  );
  const ordered = opts.after ? rows : rows.reverse();
  return { messages: ordered.map((m) => ({ ...m, mine: m.author_id === r.user.id })), more: !opts.after && rows.length === 50 };
}

export async function postMessage(db: Db, r: Rights, threadId: string, body: string, orderId: string | null = null, now = new Date()) {
  assertActive(r);
  const t = await getThread(db, r, threadId);
  if (!t) throw new UserError("Dit gesprek bestaat niet.");
  if (t.blocked) throw new UserError("Je kunt in dit gesprek geen berichten meer sturen.");
  const text = body.trim();
  if (!text) throw new UserError("Je bericht is leeg.");
  if (text.length > 4000) throw new UserError("Houd je bericht onder de 4000 tekens.");
  await limit(db, "threadMessages", r.user.id, now);
  const row = await one<{ id: number }>(
    db,
    `insert into thread_messages (thread_id, author_id, body, order_id, created_at) values ($1, $2, $3, $4, $5) returning id::int as id`,
    [threadId, r.user.id, text, orderId, now],
  );
  await db.query(`update threads set last_message_at = $2 where id = $1`, [threadId, now]);
  await markRead(db, r.user.id, threadId, row!.id);
  return row!.id;
}
