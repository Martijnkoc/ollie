import { hasCronSecret } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { config } from "@/lib/env";
import { privateJson, serverError } from "@/lib/http";
import { runDueJobs } from "@/lib/sync/scheduler";

export const maxDuration = 60;

/**
 * Scheduler entry point: Vercel Cron (every minute on Pro), Supabase pg_cron or any external
 * scheduler calls this with `Authorization: Bearer $CRON_SECRET`. Running it more often than
 * needed is harmless: jobs that are not due do not contact the provider.
 */
export async function GET(req: Request) {
  const cfg = config();
  if (!hasCronSecret(req.headers.get("authorization"), cfg)) return privateJson({ error: "Geen toegang" }, 401);
  try {
    const report = await runDueJobs({ db: await getDb(), cfg, trigger: "cron", deadlineMs: 45_000 });
    return privateJson(report);
  } catch (err) {
    return serverError(err, "cron/sync");
  }
}
