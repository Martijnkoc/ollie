import { LOCATIESERVER_ID, PDOK_ERROR_TEXT, PdokError, lookupAddress, pdokConfig } from "@/lib/address/pdok";
import { clientKey, json, logError } from "@/lib/server/http";
import { allow } from "@/lib/server/ratelimit";

/** Details of the one address the user picked from the suggestions. */
export async function GET(req: Request, ctx: RouteContext<"/api/adres/[id]">) {
  if (!allow("adresDetail", clientKey(req))) return json({ error: PDOK_ERROR_TEXT["rate-limit"].message }, 429, { "Retry-After": "10" });
  const { id } = await ctx.params;
  if (!LOCATIESERVER_ID.test(id)) return json({ error: "Onbekend adres." }, 400);
  try {
    const address = await lookupAddress(id, { fetch, config: pdokConfig() });
    if (!address) return json({ error: "Dit adres is niet (meer) gevonden. Zoek het opnieuw." }, 404);
    return json({ address });
  } catch (err) {
    if (err instanceof PdokError) return json({ error: PDOK_ERROR_TEXT[err.kind].message }, PDOK_ERROR_TEXT[err.kind].status);
    logError("adres/detail", err);
    return json({ error: "Er ging iets mis bij het ophalen van dit adres." }, 500);
  }
}
