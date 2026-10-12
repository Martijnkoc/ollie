// Gives an e-mail address the admin role (creating the account if needed).
// Usage: DATABASE_URL=… npm run admin:grant -- naam@voorbeeld.nl
import { getDb } from "../src/lib/db.ts";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Geef een e-mailadres op.");
  process.exit(1);
}
const db = await getDb();
const [user] = await db.query<{ id: string }>(
  `insert into users (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
  [email],
);
await db.query(`insert into roles (user_id, role) values ($1, 'admin') on conflict do nothing`, [user.id]);
await db.query(
  `insert into moderation_actions (actor_id, target_id, action, reason) values (null, $1, 'grant_admin', 'toegekend via script')`,
  [user.id],
);
console.log(`Beheerdersrol toegekend aan ${email}.`);
process.exit(0);
