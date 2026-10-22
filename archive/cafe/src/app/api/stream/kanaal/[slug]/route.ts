import { viewer } from "@/lib/access";
import { channelMessages, getChannel } from "@/lib/community/channels";
import { getDb } from "@/lib/db";
import { pollingStream, startId } from "@/lib/sse";

export const maxDuration = 30;

export async function GET(req: Request, ctx: RouteContext<"/api/stream/kanaal/[slug]">) {
  const { slug } = await ctx.params;
  const v = await viewer();
  // Same rule as the page: only active, unrestricted members with a profile.
  if (!v?.community) return new Response("Geen toegang", { status: 403 });
  const db = await getDb();
  const channel = await getChannel(db, slug);
  if (!channel) return new Response("Niet gevonden", { status: 404 });
  return pollingStream(req, startId(req), async (after) => (await channelMessages(db, v, channel.id, { after })).messages);
}
