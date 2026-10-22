import { type Rights, rightsFor } from "@/lib/access";
import { connectPglite, type Db, migrate } from "@/lib/db";

let shared: Promise<Db> | undefined;

/** One embedded Postgres per test file, emptied before every test. */
export async function freshDb() {
  shared ??= connectPglite().then(async (db) => {
    await migrate(db);
    return db;
  });
  const db = await shared;
  const tables = await db.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`,
  );
  await db.query(`truncate ${tables.map((t) => `"${t.tablename}"`).join(", ")} cascade`);
  return db;
}

export const NOW = new Date("2026-10-22T10:00:00Z");
export const days = (n: number, base = NOW) => new Date(base.getTime() + n * 86_400_000);

/** A user with a profile; `maker` publishes it with a headline and a category. */
export async function makeUser(db: Db, name: string, opts: { maker?: boolean; region?: string; remote?: boolean } = {}): Promise<Rights> {
  const username = name.toLowerCase();
  const [{ id }] = await db.query<{ id: string }>(`insert into users (email) values ($1) returning id`, [`${username}@test.nl`]);
  await db.query(
    `insert into profiles (user_id, username, display_name, headline, categories, published, region, works_remote, city)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'Utrecht')`,
    [
      id,
      username,
      name,
      opts.maker ? `${name} maakt dingen` : "",
      opts.maker ? ["creatief"] : [],
      Boolean(opts.maker),
      opts.region ?? null,
      Boolean(opts.remote),
    ],
  );
  return rightsFor(db, id);
}

/** A ready media row, as if an upload had passed the checks. */
export async function makeMedia(db: Db, r: Rights, purpose: string, kind: "image" | "video" = "image") {
  const [{ id }] = await db.query<{ id: string }>(
    `insert into media (owner_id, purpose, kind, storage_key, content_type, size_bytes, status)
     values ($1, $2, $3, $1 || '/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000, 'ready') returning id`,
    [r.user.id, purpose, kind],
  );
  return id;
}

export const service = (over: Partial<Record<string, unknown>> = {}) => ({
  kind: "fixed",
  title: "Portretshoot op locatie",
  summary: "Een uur fotograferen, twintig bewerkte foto's.",
  description: "Ik kom naar je toe en fotografeer je een uur lang op een plek die bij je past.",
  category: "creatief",
  includes: "1 uur fotograferen\n20 bewerkte foto's",
  price: "150",
  deliveryDays: "7",
  locationMode: "both",
  coverId: null,
  status: "published",
  extras: [{ title: "Extra uur", price: "75", days: "2" }],
  ...over,
});

/** Marks an order paid exactly as the webhook does, for tests that are not about the webhook. */
export async function markPaid(db: Db, orderId: string, at = NOW) {
  await db.query(
    `update orders set status = 'in_progress', payment_status = 'paid', stripe_payment_intent_id = 'pi_' || substr(id::text, 1, 8),
       stripe_charge_id = 'ch_' || substr(id::text, 1, 8), paid_at = $2::timestamptz, due_at = $2::timestamptz + make_interval(days => delivery_days) where id = $1`,
    [orderId, at],
  );
}
