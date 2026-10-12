import { type Rights, assertCommunity, rightsFor } from "../access";
import { assertNotBlocked, blockedEitherWay } from "../blocks";
import { type Db, one } from "../db";
import { UserError } from "../errors";
import { limit } from "../ratelimit";

export type Thread = { id: string; other_id: string; other_alias: string; created_at: Date; last_at: Date | null; blocked: boolean };
export type ThreadMessage = { id: number; author_id: string; body: string; created_at: Date; mine: boolean };

const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);

/** Private contact always starts with a request the other person accepts. */
export async function sendRequest(db: Db, r: Rights, toId: string, message: string, now = new Date()) {
  assertCommunity(r);
  if (toId === r.user.id) throw new UserError("Je kunt jezelf geen verzoek sturen.");
  await assertNotBlocked(db, r.user.id, toId);
  const target = await rightsFor(db, toId, now);
  if (!target.community || !target.profile?.listed) throw new UserError("Deze persoon is nu niet bereikbaar.");
  if (await threadBetween(db, r.user.id, toId)) throw new UserError("Jullie kunnen al met elkaar chatten.");
  const text = message.trim();
  if (text.length > 280) throw new UserError("Houd je berichtje onder de 280 tekens.");
  await limit(db, "contactRequests", r.user.id, now);
  const rows = await db.query(
    `insert into contact_requests (from_id, to_id, message, created_at) values ($1, $2, $3, $4) on conflict do nothing returning id`,
    [r.user.id, toId, text, now],
  );
  if (rows.length === 0) throw new UserError("Je hebt deze persoon al een verzoek gestuurd.");
}

export async function respondToRequest(db: Db, r: Rights, requestId: string, accept: boolean, now = new Date()) {
  assertCommunity(r);
  return db.transaction(async (tx) => {
    const req = await one<{ from_id: string; to_id: string; status: string }>(
      tx,
      `select from_id, to_id, status from contact_requests where id = $1 for update`,
      [requestId],
    );
    if (!req || req.to_id !== r.user.id) throw new UserError("Dit verzoek bestaat niet.");
    if (req.status !== "pending") throw new UserError("Op dit verzoek is al gereageerd.");
    if (accept) await assertNotBlocked(tx, req.from_id, req.to_id);
    await tx.query(`update contact_requests set status = $2, responded_at = $3 where id = $1`, [
      requestId,
      accept ? "accepted" : "declined",
      now,
    ]);
    if (!accept) return undefined;
    const [a, b] = pair(req.from_id, req.to_id);
    const thread = await one<{ id: string }>(
      tx,
      `insert into threads (user_a, user_b, created_at) values ($1, $2, $3) on conflict (user_a, user_b) do update set user_a = excluded.user_a returning id`,
      [a, b, now],
    );
    return thread!.id;
  });
}

export async function withdrawRequest(db: Db, r: Rights, requestId: string, now = new Date()) {
  await db.query(
    `update contact_requests set status = 'withdrawn', responded_at = $3 where id = $1 and from_id = $2 and status = 'pending'`,
    [requestId, r.user.id, now],
  );
}

export async function requestsFor(db: Db, r: Rights) {
  assertCommunity(r);
  return db.query<{ id: string; from_id: string; to_id: string; alias: string; message: string; created_at: Date; incoming: boolean }>(
    `select c.id, c.from_id, c.to_id, coalesce(p.alias, 'Lid') as alias, c.message, c.created_at, c.to_id = $1 as incoming
     from contact_requests c
     left join profiles p on p.user_id = case when c.to_id = $1 then c.from_id else c.to_id end
     where c.status = 'pending' and (c.to_id = $1 or c.from_id = $1)
     order by c.created_at desc`,
    [r.user.id],
  );
}

export async function threadBetween(db: Db, x: string, y: string) {
  const [a, b] = pair(x, y);
  return one<{ id: string }>(db, `select id from threads where user_a = $1 and user_b = $2`, [a, b]);
}

export async function threadsFor(db: Db, r: Rights) {
  assertCommunity(r);
  return db.query<Thread>(
    `select t.id, o.user_id as other_id, coalesce(o.alias, 'Verwijderd account') as other_alias, t.created_at,
       (select max(created_at) from thread_messages m where m.thread_id = t.id) as last_at,
       exists (select 1 from blocks b where (b.blocker_id = $1 and b.blocked_id = o.user_id) or (b.blocker_id = o.user_id and b.blocked_id = $1)) as blocked
     from threads t
     left join profiles o on o.user_id = case when t.user_a = $1 then t.user_b else t.user_a end
     where t.user_a = $1 or t.user_b = $1
     order by coalesce((select max(created_at) from thread_messages m where m.thread_id = t.id), t.created_at) desc`,
    [r.user.id],
  );
}

/** The thread, but only for one of its two members. Anyone else gets nothing. */
export async function getThread(db: Db, r: Rights, threadId: string) {
  assertCommunity(r);
  const t = await one<{ id: string; user_a: string; user_b: string }>(db, `select id, user_a, user_b from threads where id = $1`, [
    threadId,
  ]);
  if (!t || (t.user_a !== r.user.id && t.user_b !== r.user.id)) return undefined;
  const otherId = t.user_a === r.user.id ? t.user_b : t.user_a;
  const other = await one<{ alias: string }>(db, `select alias from profiles where user_id = $1`, [otherId]);
  return { id: t.id, otherId, otherAlias: other?.alias ?? "Verwijderd account", blocked: await blockedEitherWay(db, r.user.id, otherId) };
}

export async function threadMessages(db: Db, r: Rights, threadId: string, opts: { before?: number; after?: number } = {}) {
  const t = await getThread(db, r, threadId);
  if (!t) throw new UserError("Dit gesprek bestaat niet.");
  const rows = await db.query<Omit<ThreadMessage, "mine">>(
    `select id::int as id, author_id, body, created_at from thread_messages
     where thread_id = $1 and deleted_at is null and ($2::bigint is null or id < $2) and ($3::bigint is null or id > $3)
     order by id ${opts.after ? "asc" : "desc"} limit 40`,
    [threadId, opts.before ?? null, opts.after ?? null],
  );
  const ordered = opts.after ? rows : rows.reverse();
  return { messages: ordered.map((m) => ({ ...m, mine: m.author_id === r.user.id })), more: !opts.after && rows.length === 40 };
}

export async function postThreadMessage(db: Db, r: Rights, threadId: string, body: string, now = new Date()) {
  const t = await getThread(db, r, threadId);
  if (!t) throw new UserError("Dit gesprek bestaat niet.");
  if (t.blocked) throw new UserError("Je kunt in dit gesprek geen berichten meer sturen.");
  const text = body.trim();
  if (!text) throw new UserError("Je bericht is leeg.");
  if (text.length > 2000) throw new UserError("Houd je bericht onder de 2000 tekens.");
  await limit(db, "threadMessages", r.user.id, now);
  const row = await one<{ id: number }>(
    db,
    `insert into thread_messages (thread_id, author_id, body, created_at) values ($1, $2, $3, $4) returning id::int as id`,
    [threadId, r.user.id, text, now],
  );
  return row!.id;
}
