import { getDb } from "@/lib/db";
import { safeEqual } from "@/lib/tokens";
import { sweep } from "@/lib/sweep";

/** Called by the scheduler with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || !safeEqual(given, secret)) return new Response("Geen toegang", { status: 401 });
  return Response.json(await sweep(await getDb()));
}
