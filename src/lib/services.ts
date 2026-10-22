import { type Rights, assertActive } from "./access";
import { CATEGORY_KEYS, LOCATION_MODES, MAX_DELIVERY_DAYS, MAX_EXTRAS, MAX_INCLUDES, MAX_SERVICES } from "./config";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { assertPrice, parseEuro } from "./money";
import { assertOwnMedia, mediaUrl } from "./storage";

export type Extra = { id: string; title: string; price_cents: number; extra_days: number };

export type Service = {
  id: string;
  owner_id: string;
  kind: "fixed" | "custom";
  title: string;
  summary: string;
  description: string;
  category: string;
  includes: string[];
  price_cents: number | null;
  delivery_days: number | null;
  location_mode: "remote" | "on_site" | "both";
  cover_id: string | null;
  cover_url: string | null;
  status: "draft" | "published" | "paused";
  hidden_at: Date | null;
  hidden_reason: string | null;
  created_at: Date;
  updated_at: Date;
  extras: Extra[];
  /** Published, not hidden, and its maker is public and not restricted. */
  visible: boolean;
  owner: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    city: string;
    seller_type: string;
    kvk_number: string | null;
  };
};

/** SQL condition: content of a maker anyone may see. Expects the maker's profile as `p` and user as `u`. */
export const OWNER_PUBLIC = `p.published and p.hidden_at is null and u.restricted_at is null`;

export type ServiceInput = {
  kind: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  includes: string;
  price: string;
  deliveryDays: string;
  locationMode: string;
  coverId: string | null;
  status: string;
  extras: { title: string; price: string; days: string }[];
};

function clean(input: ServiceInput) {
  const kind = input.kind === "custom" ? "custom" : "fixed";
  const title = input.title.trim();
  if (title.length < 5 || title.length > 80) throw new UserError("Geef je dienst een titel van 5 tot 80 tekens.");
  const summary = input.summary.trim();
  if (summary.length > 160) throw new UserError("De korte omschrijving heeft maximaal 160 tekens.");
  const description = input.description.trim();
  if (description.length > 5000) throw new UserError("De omschrijving heeft maximaal 5000 tekens.");
  if (!(CATEGORY_KEYS as string[]).includes(input.category)) throw new UserError("Kies een categorie.");
  const includes = input.includes
    .split("\n")
    .map((s) => s.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean);
  if (includes.length > MAX_INCLUDES) throw new UserError(`Noem maximaal ${MAX_INCLUDES} punten bij "wat is inbegrepen".`);
  if (includes.some((s) => s.length > 120)) throw new UserError('Een punt bij "wat is inbegrepen" heeft maximaal 120 tekens.');
  if (!LOCATION_MODES.some((m) => m.key === input.locationMode)) throw new UserError("Kies waar je de dienst levert.");
  const status = ["draft", "published", "paused"].includes(input.status) ? input.status : "draft";

  let price = parseEuro(input.price);
  let days: number | null = input.deliveryDays.trim() ? Number(input.deliveryDays) : null;
  if (kind === "fixed") {
    price = assertPrice(price);
    if (days == null || !Number.isInteger(days) || days < 1 || days > MAX_DELIVERY_DAYS) {
      throw new UserError(`Vul een levertijd in van 1 tot ${MAX_DELIVERY_DAYS} dagen.`);
    }
  } else {
    // Custom work: an optional "from" price; the real price comes from a quote.
    if (price != null) price = assertPrice(price, "De vanafprijs");
    days = null;
  }

  const extras =
    kind === "fixed"
      ? input.extras
          .filter((e) => e.title.trim() || e.price.trim())
          .map((e) => {
            const t = e.title.trim();
            if (t.length < 3 || t.length > 80) throw new UserError("Geef elke uitbreiding een naam van 3 tot 80 tekens.");
            const p = parseEuro(e.price);
            if (p == null || p < 0 || p > 1_000_000) throw new UserError(`Vul een prijs in voor de uitbreiding "${t}".`);
            const d = e.days.trim() ? Number(e.days) : 0;
            if (!Number.isInteger(d) || d < 0 || d > 90) throw new UserError(`De extra levertijd van "${t}" is 0 tot 90 dagen.`);
            return { title: t, price_cents: p, extra_days: d };
          })
      : [];
  if (extras.length > MAX_EXTRAS) throw new UserError(`Maximaal ${MAX_EXTRAS} uitbreidingen.`);
  if (status === "published" && description.length < 30) {
    throw new UserError("Beschrijf je dienst in minstens 30 tekens voordat je hem publiceert.");
  }
  return {
    kind,
    title,
    summary,
    description,
    category: input.category,
    includes,
    price,
    days,
    locationMode: input.locationMode,
    status,
    extras,
  };
}

export async function saveService(db: Db, r: Rights, input: ServiceInput, serviceId?: string, now = new Date()) {
  assertActive(r);
  const s = clean(input);
  const coverId = await assertOwnMedia(db, r.user.id, input.coverId, ["service", "portfolio"]);
  return db.transaction(async (tx) => {
    let id = serviceId;
    if (id) {
      const own = await one<{ owner_id: string }>(tx, `select owner_id from services where id::text = $1 for update`, [id]);
      if (!own || own.owner_id !== r.user.id) throw new UserError("Deze dienst bestaat niet.");
      await tx.query(
        `update services set kind = $2, title = $3, summary = $4, description = $5, category = $6, includes = $7, price_cents = $8,
           delivery_days = $9, location_mode = $10, cover_id = $11, status = $12, updated_at = $13 where id = $1`,
        [id, s.kind, s.title, s.summary, s.description, s.category, s.includes, s.price, s.days, s.locationMode, coverId, s.status, now],
      );
      await tx.query(`delete from service_extras where service_id = $1`, [id]);
    } else {
      const count = await one<{ n: number }>(tx, `select count(*)::int as n from services where owner_id = $1`, [r.user.id]);
      if ((count?.n ?? 0) >= MAX_SERVICES) throw new UserError(`Je kunt maximaal ${MAX_SERVICES} diensten hebben.`);
      const row = await one<{ id: string }>(
        tx,
        `insert into services (owner_id, kind, title, summary, description, category, includes, price_cents, delivery_days, location_mode, cover_id, status, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13) returning id`,
        [
          r.user.id,
          s.kind,
          s.title,
          s.summary,
          s.description,
          s.category,
          s.includes,
          s.price,
          s.days,
          s.locationMode,
          coverId,
          s.status,
          now,
        ],
      );
      id = row!.id;
    }
    for (const [i, e] of s.extras.entries()) {
      await tx.query(`insert into service_extras (service_id, title, price_cents, extra_days, sort) values ($1, $2, $3, $4, $5)`, [
        id,
        e.title,
        e.price_cents,
        e.extra_days,
        i,
      ]);
    }
    return id!;
  });
}

export async function setServiceStatus(db: Db, r: Rights, serviceId: string, status: "published" | "paused" | "draft", now = new Date()) {
  assertActive(r);
  const s = await one<{ owner_id: string; description: string }>(db, `select owner_id, description from services where id::text = $1`, [
    serviceId,
  ]);
  if (!s || s.owner_id !== r.user.id) throw new UserError("Deze dienst bestaat niet.");
  if (status === "published" && s.description.trim().length < 30) {
    throw new UserError("Beschrijf je dienst in minstens 30 tekens voordat je hem publiceert.");
  }
  await db.query(`update services set status = $2, updated_at = $3 where id = $1`, [serviceId, status, now]);
}

/** Deleting keeps orders intact: they hold their own snapshot of title and price. */
export async function deleteService(db: Db, r: Rights, serviceId: string) {
  assertActive(r);
  const rows = await db.query(`delete from services where id::text = $1 and owner_id = $2 returning id`, [serviceId, r.user.id]);
  if (!rows.length) throw new UserError("Deze dienst bestaat niet.");
}

type ServiceRow = Omit<Service, "extras" | "cover_url" | "visible" | "owner"> & {
  cover_key: string | null;
  visible: boolean;
  username: string;
  display_name: string;
  avatar_key: string | null;
  city: string;
  seller_type: string;
  kvk_number: string | null;
};

const SERVICE_SELECT = `s.*, cm.storage_key as cover_key, p.username, p.display_name, av.storage_key as avatar_key, p.city, p.seller_type, p.kvk_number,
  (s.status = 'published' and s.hidden_at is null and ${OWNER_PUBLIC}) as visible
  from services s join profiles p on p.user_id = s.owner_id join users u on u.id = s.owner_id
  left join media cm on cm.id = s.cover_id left join media av on av.id = p.avatar_id`;

function toService(row: ServiceRow, extras: Extra[]): Service {
  const { cover_key, username, display_name, avatar_key, city, seller_type, kvk_number, ...rest } = row;
  return {
    ...rest,
    cover_url: mediaUrl(cover_key),
    extras,
    owner: { username, display_name, avatar_url: mediaUrl(avatar_key), city, seller_type, kvk_number },
  };
}

/** A service as the viewer may see it: the owner sees drafts, others only visible services. */
export async function getService(db: Db, serviceId: string, viewerId?: string) {
  if (!/^[0-9a-f-]{36}$/.test(serviceId)) return undefined;
  const row = await one<ServiceRow>(db, `select ${SERVICE_SELECT} where s.id = $1`, [serviceId]);
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
  const extras = await db.query<Extra>(
    `select id, title, price_cents, extra_days from service_extras where service_id = $1 order by sort`,
    [serviceId],
  );
  return toService(row, extras);
}

export async function servicesOf(db: Db, ownerId: string, opts: { includeHidden: boolean }) {
  const rows = await db.query<ServiceRow>(
    `select ${SERVICE_SELECT} where s.owner_id = $1 ${opts.includeHidden ? "" : "and s.status = 'published' and s.hidden_at is null"}
     order by s.status = 'published' desc, s.created_at desc`,
    [ownerId],
  );
  return rows.map((r) => toService(r, []));
}
