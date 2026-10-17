import { readContext } from "@/lib/data";
import { getSearchIndex } from "@/lib/football/queries";
import { publicJson, serverError } from "@/lib/http";

/** Teams and competitions for the client-side search box. Small, and changes rarely. */
export async function GET() {
  try {
    const read = await readContext();
    return publicJson({ entries: read ? await getSearchIndex(read) : [] }, 3600, 86_400);
  } catch (err) {
    return serverError(err, "v1/search");
  }
}
