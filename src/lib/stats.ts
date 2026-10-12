import { type Db, one } from "./db";

/** Aggregates only. Individual feedback is never shown to staff here. */
export async function stats(db: Db) {
  const n = async (sql: string) => (await one<{ n: number }>(db, sql))?.n ?? 0;
  const helped = await db.query<{ helped: string; n: number }>(`select helped, count(*)::int as n from feedback group by helped`);
  return {
    users: await n(`select count(*)::int as n from users`),
    profiles: await n(`select count(*)::int as n from profiles`),
    members: await n(`select count(*)::int as n from memberships where status in ('active', 'trialing', 'past_due')`),
    datesScheduled: await n(`select count(*)::int as n from dates where status in ('scheduled', 'live')`),
    datesHeld: await n(`select count(*)::int as n from dates where started_at is not null`),
    noShows: await n(`select count(*)::int as n from dates where status = 'no_show'`),
    mutual: await n(
      `select count(*)::int as n from dates d where (select count(*) from feedback f where f.date_id = d.id and f.next in ('meet', 'call')) = 2`,
    ),
    feedback: await n(`select count(*)::int as n from feedback`),
    helped: Object.fromEntries(helped.map((r) => [r.helped, r.n])) as Partial<Record<"yes" | "somewhat" | "no", number>>,
    messages: await n(`select count(*)::int as n from messages where created_at > now() - interval '7 days'`),
    openReports: await n(`select count(*)::int as n from reports where status = 'open'`),
    openAppeals: await n(`select count(*)::int as n from appeals where status = 'open'`),
    restricted: await n(`select count(*)::int as n from users where restricted_at is not null`),
  };
}
