import { z } from "zod";
import { PDOK_ERROR_TEXT, PdokError, fetchBuilding, pdokConfig } from "@/lib/address/pdok";
import { clientKey, json, logError } from "@/lib/server/http";
import { allow } from "@/lib/server/ratelimit";

const query = z.object({
  vbo: z.string().regex(/^\d{16}$/).nullable(),
  lat: z.coerce.number().min(50).max(54).nullable(),
  lon: z.coerce.number().min(3).max(8).nullable(),
});

/** Registered building data (BAG via PDOK) for a confirmed address. */
export async function GET(req: Request) {
  if (!allow("woning", clientKey(req))) return json({ error: PDOK_ERROR_TEXT["rate-limit"].message }, 429, { "Retry-After": "10" });
  const params = new URL(req.url).searchParams;
  const parsed = query.safeParse({ vbo: params.get("vbo"), lat: params.get("lat"), lon: params.get("lon") });
  if (!parsed.success) return json({ error: "Ongeldige aanvraag." }, 400);
  const { vbo, lat, lon } = parsed.data;
  try {
    const building = await fetchBuilding({ verblijfsobjectId: vbo, point: lat !== null && lon !== null ? { lat, lon } : null }, { fetch, config: pdokConfig() });
    return json({ building });
  } catch (err) {
    if (err instanceof PdokError) return json({ error: PDOK_ERROR_TEXT[err.kind].message }, PDOK_ERROR_TEXT[err.kind].status);
    logError("woning", err);
    return json({ error: "Er ging iets mis bij het ophalen van de gebouwgegevens." }, 500);
  }
}
