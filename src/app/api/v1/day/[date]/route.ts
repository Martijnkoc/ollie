import { readContext, siteStatus } from "@/lib/data";
import { getDayBoard } from "@/lib/football/queries";
import { privateJson, publicJson, serverError } from "@/lib/http";
import { isValidDay } from "@/lib/time";
import { refreshAfterResponse } from "@/lib/traffic";

/** Matches of one Dutch calendar day, for the live board. Cached at the edge for 15 seconds. */
export async function GET(_req: Request, ctx: RouteContext<"/api/v1/day/[date]">) {
  const { date } = await ctx.params;
  if (!isValidDay(date)) return privateJson({ error: "Ongeldige datum" }, 400);
  try {
    const read = await readContext();
    if (!read)
      return publicJson({ day: date, mode: "unconfigured", generatedAt: new Date().toISOString(), lastSync: null, matches: [] }, 60);
    const [board, status] = await Promise.all([getDayBoard(read, date), siteStatus(read.db, read.cfg, read.now)]);
    refreshAfterResponse(read);
    return publicJson(
      { day: date, mode: read.cfg.dataMode, generatedAt: read.now.toISOString(), lastSync: status.lastSync, matches: board.matches },
      15,
    );
  } catch (err) {
    return serverError(err, "v1/day");
  }
}
