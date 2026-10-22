import { LIMITS } from "./config";
import { type Db, one } from "./db";
import { UserError } from "./errors";

/** Counts an event and refuses it when the key is over its limit within the window. */
export async function limit(db: Db, kind: keyof typeof LIMITS, subject: string, now = new Date()) {
  const [max, windowSeconds] = LIMITS[kind];
  const key = `${kind}:${subject}`;
  const since = new Date(now.getTime() - windowSeconds * 1000);
  const row = await one<{ n: number }>(db, `select count(*)::int as n from rate_events where key = $1 and created_at > $2`, [key, since]);
  if ((row?.n ?? 0) >= max) throw new UserError("Even rustig aan: je hebt dit te vaak achter elkaar gedaan. Probeer het later opnieuw.");
  await db.query(`insert into rate_events (key, created_at) values ($1, $2)`, [key, now]);
}
