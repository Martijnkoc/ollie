// Empties the dedicated end-to-end database before the app starts; the app migrates it again.
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url || !/e2e/.test(url)) throw new Error("Refusing to reset a database whose URL does not contain 'e2e'.");
const sql = postgres(url, { onnotice: () => {} });
await sql.unsafe("drop schema public cascade; create schema public;");
await sql.end();
console.log("e2e database reset");
