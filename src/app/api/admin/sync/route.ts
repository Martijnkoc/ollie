import { z } from "zod";
import { ADMIN_CHALLENGE, clientIp, hasAdminCredentials } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { config } from "@/lib/env";
import { privateJson, serverError } from "@/lib/http";
import { withinLimit } from "@/lib/ratelimit";
import { runDueJobs } from "@/lib/sync/scheduler";

export const maxDuration = 60;

const bodySchema = z.object({
  only: z
    .array(z.string().regex(/^[a-z:-]{2,60}$/))
    .max(20)
    .optional(),
  force: z.boolean().optional(),
});

/** Manual synchronisation for administrators (HTTP Basic). Leases and budgets still apply. */
export async function POST(req: Request) {
  const cfg = config();
  try {
    const db = await getDb();
    if (!hasAdminCredentials(req.headers.get("authorization"), cfg)) {
      // Failed attempts are limited per address; successful ones are not counted.
      const allowed = await withinLimit(db, `admin-fail:${clientIp(req.headers)}`, 10, 15 * 60);
      return privateJson({ error: allowed ? "Geen toegang" : "Te veel pogingen" }, allowed ? 401 : 429, ADMIN_CHALLENGE);
    }
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return privateJson({ error: "Ongeldige invoer" }, 400);
    const report = await runDueJobs({
      db,
      cfg,
      trigger: "admin",
      only: parsed.data.only,
      force: parsed.data.force ?? false,
      deadlineMs: 50_000,
    });
    return privateJson(report);
  } catch (err) {
    return serverError(err, "admin/sync");
  }
}
