import { currentUser } from "@/lib/auth/session";
import { heartbeat } from "@/lib/dates/session";
import { getDb } from "@/lib/db";
import { failure, json, sameOrigin } from "@/lib/http";
import { videoProvider } from "@/lib/video/provider";

export async function POST(req: Request, ctx: RouteContext<"/api/afspraken/[id]/hartslag">) {
  if (!sameOrigin(req)) return json({ error: "Ongeldige aanvraag" }, 403);
  const user = await currentUser();
  if (!user) return json({ error: "Log opnieuw in." }, 401);
  const { id } = await ctx.params;
  try {
    return json(await heartbeat(await getDb(), user.id, id, videoProvider()));
  } catch (err) {
    return failure(err);
  }
}
