import postgres from "postgres";
import { E2E_DATABASE_URL } from "../playwright.config";

export const sql = postgres(E2E_DATABASE_URL, { onnotice: () => {}, idle_timeout: 1, max: 1 });

export async function resetDb() {
  const tables = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`;
  if (tables.length) await sql.unsafe(`truncate ${tables.map((t) => `"${t.tablename}"`).join(", ")} cascade`);
}

/** Move a date so that it started `minutesAgo` minutes ago. */
export async function shiftDate(participantToken: string, minutesAgo: number) {
  await sql`update dates set starts_at = now() - make_interval(mins => ${minutesAgo})
            where id = (select date_id from participants where token = ${participantToken})`;
}
