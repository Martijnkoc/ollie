import { PDOK_ERROR_TEXT, PdokError, pdokConfig, suggestAddresses } from "@/lib/address/pdok";
import { clientKey, json, logError } from "@/lib/server/http";
import { allow } from "@/lib/server/ratelimit";

/** Address autocomplete via PDOK Locatieserver. The query is passed on, never stored or logged. */
export async function GET(req: Request) {
  if (!allow("adresZoek", clientKey(req))) return json({ error: PDOK_ERROR_TEXT["rate-limit"].message }, 429, { "Retry-After": "10" });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.length > 120) return json({ error: "Deze zoekopdracht is te lang." }, 400);
  try {
    const suggestions = await suggestAddresses(q, { fetch, config: pdokConfig() });
    return json({ suggestions });
  } catch (err) {
    if (err instanceof PdokError) return json({ error: PDOK_ERROR_TEXT[err.kind].message }, PDOK_ERROR_TEXT[err.kind].status);
    logError("adres/zoek", err);
    return json({ error: "Er ging iets mis bij het zoeken." }, 500);
  }
}
