import "server-only";
import type { AppConfig } from "./env";
import { safeEqual } from "./tokens";

/** `Authorization: Bearer <CRON_SECRET>`, as sent by Vercel Cron and our other schedulers. */
export function hasCronSecret(authorization: string | null, cfg: AppConfig) {
  if (!cfg.cronSecret || !authorization?.startsWith("Bearer ")) return false;
  return safeEqual(authorization.slice(7), cfg.cronSecret);
}

/** HTTP Basic credentials for /beheer and the admin API. Disabled entirely without ADMIN_USER/PASSWORD. */
export function hasAdminCredentials(authorization: string | null, cfg: AppConfig) {
  if (!cfg.admin || !authorization?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  const userOk = safeEqual(decoded.slice(0, i), cfg.admin.user);
  const passOk = safeEqual(decoded.slice(i + 1), cfg.admin.password);
  return userOk && passOk;
}

export const ADMIN_CHALLENGE = { "WWW-Authenticate": 'Basic realm="Voetbalradar beheer", charset="UTF-8"', "Cache-Control": "no-store" };

/** Best-effort client address behind Vercel's proxy, for rate limiting only. */
export function clientIp(headers: Headers) {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
