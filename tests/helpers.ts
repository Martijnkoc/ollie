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

export const minutes = (n: number) => n * 60_000;
