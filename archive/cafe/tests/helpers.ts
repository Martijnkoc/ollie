import { type Rights, rightsFor } from "@/lib/access";
import { connectPglite, type Db, migrate } from "@/lib/db";

let shared: Promise<Db> | undefined;

/** One embedded Postgres per test file, emptied before every test (the seeded channels stay). */
export async function freshDb() {
  shared ??= connectPglite().then(async (db) => {
    await migrate(db);
    return db;
  });
  const db = await shared;
  const tables = await db.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' and tablename not in ('schema_migrations', 'channels')`,
  );
  await db.query(`truncate ${tables.map((t) => `"${t.tablename}"`).join(", ")} cascade`);
  return db;
}

export const minutes = (n: number) => n * 60_000;
export const NOW = new Date("2026-10-12T10:00:00Z");
export const at = (offsetMinutes: number, base = NOW) => new Date(base.getTime() + minutes(offsetMinutes));

/** A user, optionally with a community profile and an active (webhook-shaped) membership. */
export async function makeUser(db: Db, email: string, opts: { profile?: boolean; member?: boolean; alias?: string } = {}): Promise<Rights> {
  const [{ id }] = await db.query<{ id: string }>(`insert into users (email) values ($1) returning id`, [email]);
  if (opts.profile ?? opts.member) {
    await db.query(
      `insert into profiles (user_id, alias, birth_date, region, intent, interests) values ($1, $2, '1992-05-01', 'utrecht', 'open', '{Wandelen}')`,
      [id, opts.alias ?? email.split("@")[0]],
    );
  }
  if (opts.member) {
    await db.query(
      `insert into memberships (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end)
       values ($1, $2, $3, 'active', $4, $5)`,
      [id, `cus_${id.slice(0, 8)}`, `sub_${id.slice(0, 8)}`, at(-24 * 60), at(29 * 24 * 60)],
    );
  }
  return rightsFor(db, id, NOW);
}

export const refresh = (db: Db, r: Rights, now = NOW) => rightsFor(db, r.user.id, now);
