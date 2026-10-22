import { viewer } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json, sameOrigin } from "@/lib/http";
import { finishUpload } from "@/lib/storage";

/** Step 3: check the stored bytes (type, size) before the file can be used anywhere. */
export async function POST(req: Request, ctx: RouteContext<"/api/uploads/[id]/klaar">) {
  if (!sameOrigin(req)) return json({ error: "Geen toegang" }, 403);
  const v = await viewer();
  if (!v?.active) return json({ error: "Geen toegang" }, 401);
  try {
    return json(await finishUpload(await getDb(), v.user.id, (await ctx.params).id));
  } catch (err) {
    return failure(err);
  }
}
