import { viewer } from "@/lib/access";
import { getDb } from "@/lib/db";
import { getThread, threadMessages } from "@/lib/messages";
import { pollingStream, startId } from "@/lib/sse";

export const maxDuration = 30;

export async function GET(req: Request, ctx: RouteContext<"/api/stream/gesprek/[id]">) {
  const { id } = await ctx.params;
  const v = await viewer();
  if (!v?.profile) return new Response("Geen toegang", { status: 403 });
  const db = await getDb();
  if (!(await getThread(db, v, id))) return new Response("Niet gevonden", { status: 404 });
  return pollingStream(req, startId(req), async (after) => (await threadMessages(db, v, id, { after })).messages);
}
