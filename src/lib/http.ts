import "server-only";

/** JSON that the CDN may cache briefly: many visitors polling cost one origin hit per window. */
export function publicJson(body: unknown, sMaxAge: number, staleWhileRevalidate = sMaxAge * 2) {
  return Response.json(body, {
    headers: { "Cache-Control": `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}` },
  });
}

export function privateJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Error body without internals; the details go to the server log only. */
export function serverError(err: unknown, where: string) {
  console.error(`[${where}]`, err instanceof Error ? `${err.name}: ${err.message}` : err);
  return privateJson({ error: "Er ging iets mis aan onze kant." }, 500);
}
