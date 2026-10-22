import { type Db } from "./db";
import { OWNER_PUBLIC } from "./services";
import { mediaUrl } from "./storage";

/** Real, recent work for the hero wall. Nothing is shown that a maker did not publish. */
export async function wallImages(db: Db, limit = 18) {
  const rows = await db.query<{ id: string; title: string; storage_key: string; display_name: string }>(
    `select i.id, i.title, m.storage_key, p.display_name from portfolio_items i join media m on m.id = i.media_id
     join profiles p on p.user_id = i.owner_id join users u on u.id = i.owner_id
     where i.published and i.hidden_at is null and m.kind = 'image' and ${OWNER_PUBLIC}
     order by i.created_at desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({ id: r.id, title: r.title, name: r.display_name, url: mediaUrl(r.storage_key)! }));
}

export type Spotlight = {
  user_id: string;
  username: string;
  display_name: string;
  headline: string;
  categories: string[];
  city: string;
  avatar_url: string | null;
  cover_url: string | null;
  featured: boolean;
  services: { id: string; title: string; kind: "fixed" | "custom"; price_cents: number | null }[];
};

/**
 * Makers chosen by the editors (never paid). Without an editorial choice we show the newest makers that
 * already have work or an offer online, and the section says so.
 */
export async function spotlight(db: Db, limit = 4): Promise<{ makers: Spotlight[]; editorial: boolean }> {
  const base = `select p.user_id, p.username, p.display_name, p.headline, p.categories, p.city, p.featured_at is not null as featured,
      av.storage_key as avatar_key, coalesce(cv.storage_key, (
        select m.storage_key from portfolio_items i join media m on m.id = i.media_id
        where i.owner_id = p.user_id and i.published and i.hidden_at is null and m.kind = 'image' order by i.created_at desc limit 1)) as cover_key
    from profiles p join users u on u.id = p.user_id left join media av on av.id = p.avatar_id left join media cv on cv.id = p.cover_id
    where ${OWNER_PUBLIC}`;
  let rows = await db.query<Record<string, unknown>>(`${base} and p.featured_at is not null order by p.featured_at desc limit $1`, [limit]);
  const editorial = rows.length > 0;
  if (!editorial) {
    rows = await db.query<Record<string, unknown>>(
      `${base} and (exists (select 1 from services s where s.owner_id = p.user_id and s.status = 'published' and s.hidden_at is null)
         or exists (select 1 from portfolio_items i where i.owner_id = p.user_id and i.published and i.hidden_at is null))
       order by p.created_at desc limit $1`,
      [limit],
    );
  }
  const makers: Spotlight[] = [];
  for (const r of rows) {
    const services = await db.query<Spotlight["services"][number]>(
      `select id, title, kind, price_cents from services where owner_id = $1 and status = 'published' and hidden_at is null order by created_at desc limit 2`,
      [r.user_id],
    );
    makers.push({
      user_id: r.user_id as string,
      username: r.username as string,
      display_name: r.display_name as string,
      headline: r.headline as string,
      categories: r.categories as string[],
      city: r.city as string,
      featured: r.featured as boolean,
      avatar_url: mediaUrl(r.avatar_key as string | null),
      cover_url: mediaUrl(r.cover_key as string | null),
      services,
    });
  }
  return { makers, editorial };
}

/** Per category: only whether there is anything yet, never an inflated number. */
export async function categoryCounts(db: Db) {
  const rows = await db.query<{ category: string; n: number }>(
    `select s.category, count(*)::int as n from services s join profiles p on p.user_id = s.owner_id join users u on u.id = s.owner_id
     where s.status = 'published' and s.hidden_at is null and ${OWNER_PUBLIC} group by s.category`,
  );
  return new Map(rows.map((r) => [r.category, r.n]));
}
