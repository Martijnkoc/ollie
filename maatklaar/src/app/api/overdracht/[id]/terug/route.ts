import { ID, readJson, sealedSchema, sha256, TOKEN } from "@/lib/transfer/http";
import { transferStore } from "@/lib/transfer/runtime";
import { clientKey, json, logError, sameOrigin } from "@/lib/server/http";
import { allow } from "@/lib/server/ratelimit";

/** The phone sends its scans back (encrypted) for the computer that started the transfer. */
export async function PUT(req: Request, ctx: RouteContext<"/api/overdracht/[id]/terug">) {
  if (!sameOrigin(req)) return json({ error: "Niet toegestaan." }, 403);
  if (!allow("overdracht", clientKey(req))) return json({ error: "Even rustig aan; probeer het zo opnieuw." }, 429);
  const { id } = await ctx.params;
  const token = req.headers.get("x-return-token") ?? "";
  if (!ID.test(id) || !TOKEN.test(token)) return json({ error: "Onbekende overdracht." }, 404);
  const parsed = sealedSchema.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "Ongeldige aanvraag." }, 400);
  const store = await transferStore();
  if (!store) return json({ error: "Verder op een ander apparaat is hier nog niet beschikbaar." }, 503);
  try {
    const ok = await store.putBack(id, await sha256(token), JSON.stringify(parsed.data), Date.now());
    return ok ? new Response(null, { status: 204 }) : json({ error: "Deze overdracht is verlopen of onbekend." }, 410);
  } catch (err) {
    logError("overdracht/terug", err);
    return json({ error: "Terugsturen lukte niet." }, 500);
  }
}
