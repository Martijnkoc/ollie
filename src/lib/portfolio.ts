import { type Rights, assertActive } from "./access";
import { CATEGORY_KEYS, MAX_PORTFOLIO } from "./config";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { OWNER_PUBLIC } from "./services";
import { assertOwnMedia, mediaUrl } from "./storage";

export type PortfolioItem = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  category: string;
  media_url: string;
  media_kind: "image" | "video";
  published: boolean;
  hidden_at: Date | null;
  hidden_reason: string | null;
  created_at: Date;
  visible: boolean;
  owner: { username: string; display_name: string; avatar_url: string | null };
};

type Row = Omit<PortfolioItem, "media_url" | "owner"> & {
  storage_key: string;
  username: string;
  display_name: string;
  avatar_key: string | null;
};

const SELECT = `i.id, i.owner_id, i.title, i.description, i.category, i.published, i.hidden_at, i.hidden_reason, i.created_at,
  m.storage_key, m.kind as media_kind, p.username, p.display_name, av.storage_key as avatar_key,
  (i.published and i.hidden_at is null and ${OWNER_PUBLIC}) as visible
  from portfolio_items i join media m on m.id = i.media_id join profiles p on p.user_id = i.owner_id join users u on u.id = i.owner_id
  left join media av on av.id = p.avatar_id`;

function toItem({ storage_key, username, display_name, avatar_key, ...rest }: Row): PortfolioItem {
  return { ...rest, media_url: mediaUrl(storage_key)!, owner: { username, display_name, avatar_url: mediaUrl(avatar_key) } };
}

function clean(input: { title: string; description: string; category: string }) {
  const title = input.title.trim();
  if (title.length < 2 || title.length > 80) throw new UserError("Geef je werk een titel van 2 tot 80 tekens.");
  const description = input.description.trim();
  if (description.length > 1500) throw new UserError("De toelichting heeft maximaal 1500 tekens.");
  if (!(CATEGORY_KEYS as string[]).includes(input.category)) throw new UserError("Kies een categorie.");
  return { title, description, category: input.category };
}

export async function addPortfolioItem(
  db: Db,
  r: Rights,
  input: { title: string; description: string; category: string; mediaId: string | null },
  now = new Date(),
) {
  assertActive(r);
  const v = clean(input);
  if (!input.mediaId) throw new UserError("Upload een foto of video van je werk.");
  const mediaId = await assertOwnMedia(db, r.user.id, input.mediaId, ["portfolio"]);
  const count = await one<{ n: number }>(db, `select count(*)::int as n from portfolio_items where owner_id = $1`, [r.user.id]);
  if ((count?.n ?? 0) >= MAX_PORTFOLIO) throw new UserError(`Je portfolio heeft een maximum van ${MAX_PORTFOLIO} items.`);
  const used = await one(db, `select 1 from portfolio_items where media_id = $1`, [mediaId]);
  if (used) throw new UserError("Dit bestand staat al in je portfolio.");
  const row = await one<{ id: string }>(
    db,
    `insert into portfolio_items (owner_id, title, description, category, media_id, created_at) values ($1, $2, $3, $4, $5, $6) returning id`,
    [r.user.id, v.title, v.description, v.category, mediaId, now],
  );
  return row!.id;
}

export async function updatePortfolioItem(
  db: Db,
  r: Rights,
  itemId: string,
  input: { title: string; description: string; category: string; published: boolean },
) {
  assertActive(r);
  const v = clean(input);
  const rows = await db.query(
    `update portfolio_items set title = $3, description = $4, category = $5, published = $6 where id::text = $1 and owner_id = $2 returning id`,
    [itemId, r.user.id, v.title, v.description, v.category, input.published],
  );
  if (!rows.length) throw new UserError("Dit werk bestaat niet.");
}

/** The file goes with it (the sweep removes the stored object once nothing refers to it). */
export async function deletePortfolioItem(db: Db, r: Rights, itemId: string) {
  assertActive(r);
  const rows = await db.query<{ media_id: string }>(
    `delete from portfolio_items where id::text = $1 and owner_id = $2 returning media_id`,
    [itemId, r.user.id],
  );
  if (!rows.length) throw new UserError("Dit werk bestaat niet.");
}

export async function getPortfolioItem(db: Db, itemId: string, viewerId?: string) {
  if (!/^[0-9a-f-]{36}$/.test(itemId)) return undefined;
  const row = await one<Row>(db, `select ${SELECT} where i.id = $1`, [itemId]);
  if (!row) return undefined;
  if (row.owner_id !== viewerId) {
    if (!row.visible) return undefined;
    if (viewerId) {
      const blocked = await one(
        db,
        `select 1 from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1)`,
        [viewerId, row.owner_id],
      );
      if (blocked) return undefined;
    }
  }
  return toItem(row);
}

export async function portfolioOf(db: Db, ownerId: string, opts: { includeHidden: boolean }) {
  const rows = await db.query<Row>(
    `select ${SELECT} where i.owner_id = $1 ${opts.includeHidden ? "" : "and i.published and i.hidden_at is null"} order by i.created_at desc`,
    [ownerId],
  );
  return rows.map(toItem);
}
