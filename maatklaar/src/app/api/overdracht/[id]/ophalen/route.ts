import { ID, sha256, TOKEN } from "@/lib/transfer/http";
import { transferStore } from "@/lib/transfer/runtime";
import { clientKey, json, logError, sameOrigin } from "@/lib/server/http";
import { allow } from "@/lib/server/ratelimit";

const REASONS = {
  onbekend: "Deze code is onbekend.",
  verlopen: "Deze code is verlopen. Maak op je andere apparaat een nieuwe.",
  gebruikt: "Deze code is al gebruikt. Maak op je andere apparaat een nieuwe.",
};

/** The phone fetches the encrypted project once, with the one-time token from the link fragment. */
export async function POST(req: Request, ctx: RouteContext<"/api/overdracht/[id]/ophalen">) {
  if (!sameOrigin(req)) return json({ error: "Niet toegestaan." }, 403);
  if (!allow("overdracht", clientKey(req))) return json({ error: "Even rustig aan; probeer het zo opnieuw." }, 429);
  const { id } = await ctx.params;
  const token = req.headers.get("x-transfer-token") ?? "";
  if (!ID.test(id) || !TOKEN.test(token)) return json({ error: REASONS.onbekend }, 404);
  const store = await transferStore();
  if (!store) return json({ error: "Verder op een ander apparaat is hier nog niet beschikbaar." }, 503);
  try {
    const r = await store.take(id, await sha256(token), Date.now());
    if (!r.ok) return json({ error: REASONS[r.reason], reason: r.reason }, r.reason === "onbekend" ? 404 : 410);
    return json({ payload: JSON.parse(r.payload) });
  } catch (err) {
    logError("overdracht/ophalen", err);
    return json({ error: "De overdracht kon niet worden opgehaald." }, 500);
  }
}
