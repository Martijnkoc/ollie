import { readContext } from "@/lib/data";
import { getMatchVersion } from "@/lib/football/queries";
import { privateJson, publicJson, serverError } from "@/lib/http";
import { refreshAfterResponse } from "@/lib/traffic";

/** Version stamp of one match; the match page reloads its content only when this changes. */
export async function GET(_req: Request, ctx: RouteContext<"/api/v1/matches/[id]">) {
  const { id } = await ctx.params;
  if (!/^\d{1,10}$/.test(id)) return privateJson({ error: "Ongeldig id" }, 400);
  try {
    const read = await readContext();
    if (!read) return privateJson({ error: "Niet geconfigureerd" }, 404);
    const version = await getMatchVersion(read, Number(id));
    if (!version) return privateJson({ error: "Niet gevonden" }, 404);
    refreshAfterResponse(read);
    return publicJson(version, 10);
  } catch (err) {
    return serverError(err, "v1/matches");
  }
}
