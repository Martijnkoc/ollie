import "server-only";
import type { Db } from "./db";

/** Counts an event under `key` and reports whether the key is still within `max` per `windowSeconds`. */
export async function withinLimit(db: Db, key: string, max: number, windowSeconds: number, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - windowSeconds * 1000);
  const [row] = await db.query<{ n: number }>(`select count(*)::int as n from rate_events where key = $1 and created_at > $2`, [
    key,
    since,
  ]);
  if ((row?.n ?? 0) >= max) return false;
  await db.query(`insert into rate_events (key, created_at) values ($1, $2)`, [key, now]);
  return true;
}
