import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Unguessable secret for a personal link (144 bits). */
export function newToken() {
  return randomBytes(18).toString("base64url");
}

/** Shorter code for the shareable invite link (96 bits). */
export function newInviteCode() {
  return randomBytes(12).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Tokens only ever contain base64url characters; reject anything else before it reaches SQL. */
export function isTokenShaped(value: string) {
  return /^[A-Za-z0-9_-]{12,64}$/.test(value);
}
