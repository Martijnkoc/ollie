import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** Bearer secret with `bytes` of cryptographic randomness, URL-safe. */
export function newToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
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

export function isTokenShaped(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{22,86}$/.test(value);
}

export function isUuid(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

export function sixDigitCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
