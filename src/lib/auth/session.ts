import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { type Db, getDb, one } from "../db";
import { hashToken, isTokenShaped, newToken } from "../tokens";

const COOKIE = "sy_session";
const SESSION_DAYS = 30;

export type SessionUser = { id: string; email: string; restricted_at: Date | null; restricted_reason: string | null };

export async function createSession(db: Db, userId: string, now = new Date()) {
  const token = newToken(32);
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.query(`insert into sessions (token_hash, user_id, created_at, expires_at, last_seen_at) values ($1, $2, $3, $4, $3)`, [
    hashToken(token),
    userId,
    now,
    expires,
  ]);
  return { token, expires };
}

export async function userForSessionToken(db: Db, token: string | undefined, now = new Date()) {
  if (!isTokenShaped(token)) return undefined;
  return one<SessionUser>(
    db,
    `select u.id, u.email, u.restricted_at, u.restricted_reason
     from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > $2`,
    [hashToken(token), now],
  );
}

export async function deleteSessionToken(db: Db, token: string | undefined) {
  if (isTokenShaped(token)) await db.query(`delete from sessions where token_hash = $1`, [hashToken(token)]);
}

/** Sets the session cookie; call from a server action or route handler. */
export async function signIn(userId: string) {
  const { token, expires } = await createSession(await getDb(), userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function signOut() {
  const jar = await cookies();
  await deleteSessionToken(await getDb(), jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
}

/** The logged-in user for this request, or undefined. Cached per request. */
export const currentUser = cache(async (): Promise<SessionUser | undefined> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return undefined;
  return userForSessionToken(await getDb(), token);
});

/** Only relative paths inside this site are allowed as a return address. */
export function safeNext(next: string | undefined | null, fallback = "/") {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

export async function requireUser(next: string) {
  const user = await currentUser();
  if (!user) redirect(`/inloggen?next=${encodeURIComponent(next)}`);
  return user;
}

export { COOKIE as SESSION_COOKIE };
