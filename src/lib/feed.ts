import { CATEGORY_KEYS, REGIONS } from "./config";
import { type Db } from "./db";
import { OWNER_PUBLIC } from "./services";
import { mediaUrl } from "./storage";

export type Owner = { user_id: string; username: string; display_name: string; avatar_url: string | null; city: string };

export type FeedService = {
  type: "service";
  id: string;
  title: string;
  summary: string;
  category: string;
  kind: "fixed" | "custom";
  price_cents: number | null;
  delivery_days: number | null;
  location_mode: string;
  cover_url: string | null;
  created_at: Date;
  owner: Owner;
};
export type FeedWork = {
  type: "work";
  id: string;
  title: string;
  category: string;
  media_url: string;
  media_kind: "image" | "video";
  created_at: Date;
  owner: Owner;
};
export type FeedMaker = {
  type: "maker";
  id: string;
  username: string;
  display_name: string;
  headline: string;
  categories: string[];
  avatar_url: string | null;
  cover_url: string | null;
  city: string;
  works_remote: boolean;
  availability: string;
  created_at: Date;
};
export type FeedItem = FeedService | FeedWork | FeedMaker;

export type FeedQuery = {
  q?: string;
  category?: string;
  kind?: "all" | "services" | "work" | "makers";
  region?: string;
  remote?: boolean;
  booking?: "direct" | "overleg";
  maxPriceCents?: number;
  following?: boolean;
  before?: Date;
  limit?: number;
};

/** Reads filters from the URL; unknown values are ignored rather than trusted. */
export function parseFeedQuery(sp: Record<string, string | string[] | undefined>): FeedQuery {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const kind = s("soort");
  const max = Number(s("max"));
  const before = s("voor") ? new Date(s("voor")!) : undefined;
  return {
    q: s("q")?.trim().slice(0, 80) || undefined,
    category: (CATEGORY_KEYS as string[]).includes(s("categorie") ?? "") ? s("categorie") : undefined,
    kind: kind === "diensten" ? "services" : kind === "werk" ? "work" : kind === "makers" ? "makers" : "all",
    region: REGIONS.some((r) => r.key === s("regio")) ? s("regio") : undefined,
    remote: s("afstand") === "1",
    booking: s("boeken") === "direct" ? "direct" : s("boeken") === "overleg" ? "overleg" : undefined,
    maxPriceCents: Number.isFinite(max) && max > 0 ? Math.round(max * 100) : undefined,
    following: s("volgend") === "1",
    before: before && !Number.isNaN(before.getTime()) ? before : undefined,
  };
}

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * The discovery feed. Organic only: newest first, optionally limited to makers you follow. There is no
 * paid promotion and no popularity score; if promotion ever comes it gets its own visible label.
 */
export async function feed(db: Db, query: FeedQuery, viewerId?: string): Promise<{ items: FeedItem[]; next?: Date }> {
  const size = query.limit ?? 24;
  const n = size + 1;
  const q = query.q ? like(query.q) : null;

  /** Each sub-query gets its own parameter list; conditions on the maker (`p`, `u`) are shared. */
  const build = () => {
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const where: string[] = [OWNER_PUBLIC];
    if (viewerId) {
      const me = p(viewerId);
      where.push(
        `not exists (select 1 from blocks b where (b.blocker_id = ${me} and b.blocked_id = p.user_id) or (b.blocked_id = ${me} and b.blocker_id = p.user_id))`,
      );
      if (query.following) where.push(`exists (select 1 from follows f where f.follower_id = ${me} and f.followee_id = p.user_id)`);
    } else if (query.following) {
      where.push("false");
    }
    if (query.region && query.remote) where.push(`(p.region = ${p(query.region)} or p.works_remote)`);
    else if (query.region) where.push(`p.region = ${p(query.region)}`);
    else if (query.remote) where.push(`p.works_remote`);
    return { params, p, where };
  };

  const jobs: Promise<FeedItem[]>[] = [];
  const showAll = query.kind === "all" && !query.booking && !query.maxPriceCents;

  if (query.kind === "all" || query.kind === "services") {
    const { params, p, where } = build();
    where.push(`s.status = 'published'`, `s.hidden_at is null`);
    if (query.before) where.push(`s.created_at < ${p(query.before)}`);
    if (query.category) where.push(`s.category = ${p(query.category)}`);
    if (q) {
      const x = p(q);
      where.push(
        `(s.title ilike ${x} or s.summary ilike ${x} or s.description ilike ${x} or p.display_name ilike ${x} or array_to_string(p.skills, ' ') ilike ${x})`,
      );
    }
    if (query.booking === "direct") where.push(`s.kind = 'fixed'`);
    if (query.booking === "overleg") where.push(`s.kind = 'custom'`);
    if (query.maxPriceCents) where.push(`coalesce(s.price_cents, 0) <= ${p(query.maxPriceCents)}`);
    if (query.remote && !query.region) where.push(`s.location_mode in ('remote', 'both')`);
    jobs.push(
      db
        .query<Record<string, unknown>>(
          `select s.id, s.title, s.summary, s.category, s.kind, s.price_cents, s.delivery_days, s.location_mode, s.created_at,
             cm.storage_key as cover_key, p.user_id, p.username, p.display_name, av.storage_key as avatar_key, p.city
           from services s join profiles p on p.user_id = s.owner_id join users u on u.id = s.owner_id
           left join media cm on cm.id = s.cover_id left join media av on av.id = p.avatar_id
           where ${where.join(" and ")} order by s.created_at desc limit ${n}`,
          params,
        )
        .then((rows) =>
          rows.map((r) => ({
            type: "service" as const,
            id: r.id as string,
            title: r.title as string,
            summary: r.summary as string,
            category: r.category as string,
            kind: r.kind as "fixed" | "custom",
            price_cents: r.price_cents as number | null,
            delivery_days: r.delivery_days as number | null,
            location_mode: r.location_mode as string,
            cover_url: mediaUrl(r.cover_key as string | null),
            created_at: r.created_at as Date,
            owner: ownerOf(r),
          })),
        ),
    );
  }

  if (showAll || query.kind === "work") {
    const { params, p, where } = build();
    where.push(`i.published`, `i.hidden_at is null`);
    if (query.before) where.push(`i.created_at < ${p(query.before)}`);
    if (query.category) where.push(`i.category = ${p(query.category)}`);
    if (q) {
      const x = p(q);
      where.push(
        `(i.title ilike ${x} or i.description ilike ${x} or p.display_name ilike ${x} or array_to_string(p.skills, ' ') ilike ${x})`,
      );
    }
    jobs.push(
      db
        .query<Record<string, unknown>>(
          `select i.id, i.title, i.category, i.created_at, m.storage_key, m.kind as media_kind,
             p.user_id, p.username, p.display_name, av.storage_key as avatar_key, p.city
           from portfolio_items i join media m on m.id = i.media_id join profiles p on p.user_id = i.owner_id join users u on u.id = i.owner_id
           left join media av on av.id = p.avatar_id
           where ${where.join(" and ")} order by i.created_at desc limit ${n}`,
          params,
        )
        .then((rows) =>
          rows.map((r) => ({
            type: "work" as const,
            id: r.id as string,
            title: r.title as string,
            category: r.category as string,
            media_url: mediaUrl(r.storage_key as string)!,
            media_kind: r.media_kind as "image" | "video",
            created_at: r.created_at as Date,
            owner: ownerOf(r),
          })),
        ),
    );
  }

  if (showAll || query.kind === "makers") {
    const { params, p, where } = build();
    if (query.before) where.push(`p.created_at < ${p(query.before)}`);
    if (query.category) where.push(`${p(query.category)} = any(p.categories)`);
    if (q) {
      const x = p(q);
      where.push(
        `(p.display_name ilike ${x} or p.headline ilike ${x} or p.bio ilike ${x} or p.city ilike ${x} or p.username ilike ${x} or array_to_string(p.skills, ' ') ilike ${x})`,
      );
    }
    jobs.push(
      db
        .query<Record<string, unknown>>(
          `select p.user_id, p.username, p.display_name, p.headline, p.categories, p.city, p.works_remote, p.availability, p.created_at,
             av.storage_key as avatar_key, coalesce(cv.storage_key, (
               select m.storage_key from portfolio_items i join media m on m.id = i.media_id
               where i.owner_id = p.user_id and i.published and i.hidden_at is null and m.kind = 'image' order by i.created_at desc limit 1
             )) as cover_key
           from profiles p join users u on u.id = p.user_id left join media av on av.id = p.avatar_id left join media cv on cv.id = p.cover_id
           where ${where.join(" and ")} order by p.created_at desc limit ${n}`,
          params,
        )
        .then((rows) =>
          rows.map((r) => ({
            type: "maker" as const,
            id: r.user_id as string,
            username: r.username as string,
            display_name: r.display_name as string,
            headline: r.headline as string,
            categories: r.categories as string[],
            avatar_url: mediaUrl(r.avatar_key as string | null),
            cover_url: mediaUrl(r.cover_key as string | null),
            city: r.city as string,
            works_remote: r.works_remote as boolean,
            availability: r.availability as string,
            created_at: r.created_at as Date,
          })),
        ),
    );
  }

  const merged = (await Promise.all(jobs)).flat().sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  const items = merged.slice(0, size);
  return { items, next: merged.length > size ? items.at(-1)!.created_at : undefined };
}

function ownerOf(r: Record<string, unknown>): Owner {
  return {
    user_id: r.user_id as string,
    username: r.username as string,
    display_name: r.display_name as string,
    avatar_url: mediaUrl(r.avatar_key as string | null),
    city: r.city as string,
  };
}
