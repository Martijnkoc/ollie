import { readContext } from "@/lib/data";
import { getFavoritesMatches } from "@/lib/football/queries";
import { privateJson, publicJson, serverError } from "@/lib/http";

function ids(value: string | null): number[] | null {
  if (!value) return [];
  const parts = value.split(",");
  if (parts.length > 50 || !parts.every((p) => /^\d{1,10}$/.test(p))) return null;
  return [...new Set(parts.map(Number))].sort((a, b) => a - b);
}

/** Matches for the favourites page. The favourites themselves live only in the visitor's browser. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const teams = ids(url.searchParams.get("teams"));
  const competitions = ids(url.searchParams.get("competitions"));
  if (!teams || !competitions) return privateJson({ error: "Ongeldige invoer" }, 400);
  try {
    const read = await readContext();
    if (!read) return publicJson({ teams: [], competitions: [], live: [], upcoming: [], recent: [] }, 60);
    return publicJson(await getFavoritesMatches(read, teams, competitions), 20);
  } catch (err) {
    return serverError(err, "v1/favorites");
  }
}
