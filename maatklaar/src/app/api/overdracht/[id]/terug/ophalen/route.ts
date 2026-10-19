import { ID, sha256, TOKEN } from "@/lib/transfer/http";
import { transferStore } from "@/lib/transfer/runtime";
import { clientKey, json, logError, sameOrigin } from "@/lib/server/http";
import { allow } from "@/lib/server/ratelimit";

/** The computer asks whether the phone sent scans back; each copy is handed out once. */
export async function POST(req: Request, ctx: RouteContext<"/api/overdracht/[id]/terug/ophalen">) {
  if (!sameOrigin(req)) return json({ error: "Niet toegestaan." }, 403);
  if (!allow("overdrachtTerug", clientKey(req))) return json({ error: "Even rustig aan." }, 429);
  const { id } = await ctx.params;
  const token = req.headers.get("x-return-token") ?? "";
  if (!ID.test(id) || !TOKEN.test(token)) return json({ error: "Onbekende overdracht." }, 404);
  const store = await transferStore();
  if (!store) return json({ error: "Verder op een ander apparaat is hier nog niet beschikbaar." }, 503);
  try {
    const r = await store.takeBack(id, await sha256(token), Date.now());
    if (!r.ok) return json({ error: "Deze overdracht is verlopen of onbekend." }, r.reason === "onbekend" ? 404 : 410);
    return json({ payload: r.payload ? JSON.parse(r.payload) : null });
  } catch (err) {
    logError("overdracht/terug-ophalen", err);
    return json({ error: "Ophalen lukte niet." }, 500);
  }
}
