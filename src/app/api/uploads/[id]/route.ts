import { viewer } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json, sameOrigin } from "@/lib/http";
import { receiveLocal, storageMode } from "@/lib/storage";

/** Step 2, only in local mode (development and automated tests). In production the browser uploads to Supabase Storage. */
export async function PUT(req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  if (storageMode() !== "local") return json({ error: "Niet beschikbaar" }, 404);
  if (!sameOrigin(req)) return json({ error: "Geen toegang" }, 403);
  const v = await viewer();
  if (!v?.active) return json({ error: "Geen toegang" }, 401);
  try {
    await receiveLocal(await getDb(), v.user.id, (await ctx.params).id, req.body);
    return json({ ok: true });
  } catch (err) {
    return failure(err);
  }
}
