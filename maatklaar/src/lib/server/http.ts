import "server-only";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** State-changing JSON endpoints only accept requests from our own pages. */
export function sameOrigin(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return Boolean(origin && host && new URL(origin).host === host);
}

/** First hop of X-Forwarded-For (set by the hosting proxy), used only as a rate-limit key and never stored. */
export function clientKey(req: Request) {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}

/** Logs an error without request data: no addresses, ids or payloads. */
export function logError(context: string, err: unknown) {
  console.error(`[${context}]`, err instanceof Error ? `${err.name}: ${err.message}` : "onbekende fout");
}
