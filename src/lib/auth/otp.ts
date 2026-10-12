import { type Db, one } from "../db";
import { UserError } from "../errors";
import { mailConfigured, sendMail } from "../mail";
import { limit } from "../ratelimit";
import { hashToken, safeEqual, sixDigitCode } from "../tokens";

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

/**
 * supabase – Supabase Auth sends and checks the code (managed e-mail OTP)
 * local    – we send a code through our own mail transport and check it here
 */
export function otpProvider(): "supabase" | "local" | "none" {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) return "supabase";
  return mailConfigured() ? "local" : "none";
}

export function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

function codeHash(email: string, code: string) {
  return hashToken(`${process.env.SESSION_SECRET ?? ""}:${email}:${code}`);
}

async function supabase(path: string, body: unknown) {
  return fetch(`${process.env.SUPABASE_URL!.replace(/\/$/, "")}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function requestCode(db: Db, rawEmail: string, ip: string, now = new Date()) {
  const email = normaliseEmail(rawEmail);
  const provider = otpProvider();
  if (provider === "none") throw new UserError("Inloggen is nog niet geconfigureerd: er is geen e-maildienst ingesteld.");
  await limit(db, "otpPerEmail", email, now);
  await limit(db, "otpPerIp", ip, now);

  if (provider === "supabase") {
    const res = await supabase("otp", { email, create_user: true });
    if (!res.ok) throw new UserError("We konden je nu geen code sturen. Probeer het zo nog eens.");
    return;
  }
  const code = sixDigitCode();
  await db.query(`insert into login_codes (email, code_hash, expires_at, created_at) values ($1, $2, $3, $4)`, [
    email,
    codeHash(email, code),
    new Date(now.getTime() + CODE_MINUTES * 60_000),
    now,
  ]);
  await sendMail({
    to: email,
    subject: `Je inlogcode: ${code}`,
    text: `Je inlogcode voor Cafe is ${code}.\nDe code is ${CODE_MINUTES} minuten geldig. Heb je niets aangevraagd? Dan kun je dit bericht negeren.`,
  });
}

/** Returns the user id for a correct code, creating the account on first login. */
export async function verifyCode(db: Db, rawEmail: string, rawCode: string, now = new Date()) {
  const email = normaliseEmail(rawEmail);
  const code = rawCode.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) throw new UserError("Vul de zescijferige code uit de e-mail in.");

  if (otpProvider() === "supabase") {
    const res = await supabase("verify", { type: "email", email, token: code });
    if (!res.ok) throw new UserError("Deze code klopt niet of is verlopen.");
  } else {
    const row = await one<{ id: string; code_hash: string; attempts: number }>(
      db,
      `select id, code_hash, attempts from login_codes where email = $1 and used_at is null and expires_at > $2 order by created_at desc limit 1`,
      [email, now],
    );
    if (!row || row.attempts >= MAX_ATTEMPTS) throw new UserError("Deze code is verlopen. Vraag een nieuwe aan.");
    if (!safeEqual(row.code_hash, codeHash(email, code))) {
      await db.query(`update login_codes set attempts = attempts + 1 where id = $1`, [row.id]);
      throw new UserError("Deze code klopt niet.");
    }
    await db.query(`update login_codes set used_at = $2 where id = $1 and used_at is null`, [row.id, now]);
  }

  const user = await one<{ id: string }>(
    db,
    `insert into users (email, last_login_at) values ($1, $2)
     on conflict (email) do update set last_login_at = excluded.last_login_at returning id`,
    [email, now],
  );
  return user!.id;
}
