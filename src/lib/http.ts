import "server-only";
import { UserError } from "./errors";

/** State-changing JSON endpoints only accept requests from our own pages. */
export function sameOrigin(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return Boolean(origin && host && new URL(origin).host === host);
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function failure(err: unknown) {
  if (err instanceof UserError) return json({ error: err.message }, 403);
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  return json({ error: "Er ging iets mis aan onze kant." }, 500);
}
