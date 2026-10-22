import { type Rights, assertCommunity } from "../access";
import { hiddenUsers } from "../blocks";
import { type Db, one } from "../db";
import { UserError } from "../errors";
import { limit } from "../ratelimit";

export type Channel = { id: string; slug: string; name: string; description: string; kind: "lounge" | "table" };
export type ChatMessage = { id: number; author_id: string; alias: string; body: string; created_at: Date; mine: boolean };

const PAGE = 40;

export async function listChannels(db: Db) {
  return db.query<Channel>(`select id, slug, name, description, kind from channels where archived_at is null order by sort, name`);
}

export async function getChannel(db: Db, slug: string) {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return undefined;
  return one<Channel>(db, `select id, slug, name, description, kind from channels where slug = $1 and archived_at is null`, [slug]);
}

/**
 * Newest messages first from the database, returned oldest-first for display.
 * `before` pages back in history; `after` fetches what arrived since (realtime).
 * Messages by people the reader blocked, or who blocked the reader, are left out.
 */
export async function channelMessages(db: Db, r: Rights, channelId: string, opts: { before?: number; after?: number } = {}) {
  assertCommunity(r);
  const hidden = await hiddenUsers(db, r.user.id);
  const rows = await db.query<Omit<ChatMessage, "mine">>(
    `select m.id::int as id, m.author_id, coalesce(p.alias, 'Lid') as alias, m.body, m.created_at
     from messages m left join profiles p on p.user_id = m.author_id
     where m.channel_id = $1 and m.deleted_at is null
       and not (m.author_id = any($2::uuid[]))
       and ($3::bigint is null or m.id < $3) and ($4::bigint is null or m.id > $4)
     order by m.id ${opts.after ? "asc" : "desc"} limit ${PAGE}`,
    [channelId, hidden, opts.before ?? null, opts.after ?? null],
  );
  const ordered = opts.after ? rows : rows.reverse();
  return { messages: ordered.map((m) => ({ ...m, mine: m.author_id === r.user.id })), more: !opts.after && rows.length === PAGE };
}

export async function postMessage(db: Db, r: Rights, channelId: string, body: string, now = new Date()) {
  assertCommunity(r);
  const text = body.trim();
  if (!text) throw new UserError("Je bericht is leeg.");
  if (text.length > 1000) throw new UserError("Houd je bericht onder de 1000 tekens.");
  await limit(db, "channelMessages", r.user.id, now);
  const row = await one<{ id: number }>(
    db,
    `insert into messages (channel_id, author_id, body, created_at) values ($1, $2, $3, $4) returning id::int as id`,
    [channelId, r.user.id, text, now],
  );
  return row!.id;
}

/** Authors can remove their own message; staff can remove any message. */
export async function deleteMessage(db: Db, r: Rights, messageId: number, now = new Date()) {
  const msg = await one<{ author_id: string }>(db, `select author_id from messages where id = $1 and deleted_at is null`, [messageId]);
  if (!msg) throw new UserError("Dit bericht bestaat niet meer.");
  if (msg.author_id !== r.user.id && !r.staff) throw new UserError("Je kunt alleen je eigen berichten verwijderen.");
  await db.query(`update messages set deleted_at = $2, deleted_by = $3 where id = $1`, [messageId, now, r.user.id]);
}
