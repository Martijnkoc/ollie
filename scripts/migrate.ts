// Applies pending migrations to DATABASE_URL. The app also does this on first use;
// run it explicitly before a deploy if you prefer.
import { getDb } from "../src/lib/db.ts";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
await getDb();
console.log("Migrations up to date.");
process.exit(0);
