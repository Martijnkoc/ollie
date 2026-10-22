import { currentUser } from "@/lib/auth/session";
import { endNow } from "@/lib/dates/session";
import { getDb } from "@/lib/db";
import { failure, json, sameOrigin } from "@/lib/http";
import { videoProvider } from "@/lib/video/provider";

export async function POST(req: Request, ctx: RouteContext<"/api/afspraken/[id]/einde">) {
  if (!sameOrigin(req)) return json({ error: "Ongeldige aanvraag" }, 403);
  const user = await currentUser();
  if (!user) return json({ error: "Log opnieuw in." }, 401);
  const { id } = await ctx.params;
  try {
    await endNow(await getDb(), user.id, id, videoProvider());
    return json({ ok: true });
  } catch (err) {
    return failure(err);
  }
}
