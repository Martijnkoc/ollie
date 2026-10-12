import { MIGRATIONS } from "./migrations.ts";

export type Row = Record<string, unknown>;

export interface Db {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

type Global = typeof globalThis & { __ollieDb?: Promise<Db> };
const g = globalThis as Global;

/**
 * Production uses Postgres (e.g. Supabase) through DATABASE_URL.
 * Without it we fall back to an embedded Postgres (PGlite) in .data/ so
 * `npm run dev` works with zero setup.
 */
export function getDb(): Promise<Db> {
  if (!g.__ollieDb) {
    g.__ollieDb = connect().catch((err) => {
      g.__ollieDb = undefined;
      throw err;
    });
  }
  return g.__ollieDb;
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  const db = url ? await connectPostgres(url) : await connectPglite(process.env.PGLITE_DIR ?? ".data/pglite");
  await migrate(db);
  return db;
}

async function connectPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  // prepare: false keeps us compatible with transaction-mode poolers (Supabase port 6543).
  const sql = postgres(url, { prepare: false, max: Number(process.env.DATABASE_POOL_SIZE ?? 5), onnotice: () => {} });
  type Runner = Pick<typeof sql, "unsafe">;
  const wrap = (s: Runner, inTransaction: boolean): Db => ({
    query: async <T>(text: string, params: unknown[] = []) => (await s.unsafe(text, params as never[])) as unknown as T[],
    transaction: async (fn) => {
      if (inTransaction) return fn(wrap(s, true));
      return (await sql.begin((tx) => fn(wrap(tx, true)))) as never;
    },
  });
  return wrap(sql, false);
}

export async function connectPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) {
    const fs = await import("node:fs");
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  type Tx = Parameters<Parameters<typeof pg.transaction>[0]>[0];
  const wrap = (s: typeof pg | Tx, nested: boolean): Db => ({
    query: async <T>(text: string, params: unknown[] = []) => (await s.query<T>(text, params)).rows,
    transaction: async (fn) => {
      if (nested) return fn(wrap(s, true));
      return (s as typeof pg).transaction((tx) => fn(wrap(tx, true)));
    },
  });
  return wrap(pg, false);
}

export async function migrate(db: Db) {
  await db.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  await db.transaction(async (tx) => {
    // Serialise concurrent cold starts.
    await tx.query(`select pg_advisory_xact_lock(4242001)`);
    const done = new Set((await tx.query<{ name: string }>(`select name from schema_migrations`)).map((r) => r.name));
    for (const m of MIGRATIONS) {
      if (done.has(m.name)) continue;
      for (const statement of splitStatements(m.sql)) await tx.query(statement);
      await tx.query(`insert into schema_migrations (name) values ($1)`, [m.name]);
    }
  });
}

function splitStatements(sql: string) {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function one<T>(db: Db, text: string, params?: unknown[]): Promise<T | undefined> {
  return (await db.query<T>(text, params))[0];
}
