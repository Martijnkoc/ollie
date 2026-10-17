import { connectPglite, migrate, type Db } from "@/lib/db";
import { readConfig, type AppConfig } from "@/lib/env";

let shared: Promise<Db> | undefined;

/** One in-memory Postgres per test file, emptied before every test. */
export async function freshDb(): Promise<Db> {
  shared ??= connectPglite().then(async (db) => {
    await migrate(db);
    return db;
  });
  const db = await shared;
  const tables = await db.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`,
  );
  await db.query(`truncate ${tables.map((t) => `"${t.tablename}"`).join(", ")} restart identity cascade`);
  return db;
}

export function demoConfig(overrides: Record<string, string> = {}): AppConfig {
  return readConfig({ NODE_ENV: "test", DATA_PROVIDER: "demo", CRON_SECRET: "test-cron-secret-0123456789abcdef", ...overrides });
}

/** A clock that only moves when the test says so. */
export function clock(start: string) {
  let t = new Date(start).getTime();
  const now = () => new Date(t);
  now.advance = (minutes: number) => {
    t += minutes * 60_000;
  };
  now.set = (iso: string) => {
    t = new Date(iso).getTime();
  };
  return now;
}

/** A fetch stand-in that answers from a list of handlers and records every call. */
export function fakeFetch(handler: (url: URL, init: RequestInit | undefined, call: number) => Response | Promise<Response>) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    return handler(url, init, calls.length);
  }) as typeof fetch;
  return { impl, calls };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export const noSleep = async () => {};
