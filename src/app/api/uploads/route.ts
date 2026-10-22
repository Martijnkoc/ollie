import { viewer } from "@/lib/access";
import { getDb } from "@/lib/db";
import { failure, json, sameOrigin } from "@/lib/http";
import { startUpload } from "@/lib/storage";

/** Step 1 of an upload: validate the announced file and hand out a place to send it. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Geen toegang" }, 403);
  const v = await viewer();
  if (!v?.active) return json({ error: "Log in en maak je profiel af om te uploaden." }, 401);
  try {
    const body = (await req.json()) as { purpose?: string; contentType?: string; size?: number };
    const ticket = await startUpload(await getDb(), v.user.id, {
      purpose: String(body.purpose ?? ""),
      contentType: String(body.contentType ?? ""),
      size: Number(body.size),
    });
    return json(ticket);
  } catch (err) {
    return failure(err);
  }
}
