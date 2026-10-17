"use server";

import { headers } from "next/headers";
import { hasAdminCredentials } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { config } from "@/lib/env";
import { runDueJobs } from "@/lib/sync/scheduler";

export interface SyncActionState {
  ok?: boolean;
  lines?: string[];
  error?: string;
}

const ALLOWED =
  /^(competitions|live|fixtures:near|standings|teams|fixtures:season|fixtures:history|details:backfill|analyses|maintenance)[a-z:-]*$/;

/** Runs selected jobs now. Re-checks the admin credentials; leases and budgets still apply. */
export async function runSyncAction(_prev: SyncActionState, form: FormData): Promise<SyncActionState> {
  const cfg = config();
  if (!hasAdminCredentials((await headers()).get("authorization"), cfg)) return { error: "Geen toegang." };
  const job = String(form.get("job") ?? "");
  if (job && !ALLOWED.test(job)) return { error: "Onbekende taak." };
  try {
    const report = await runDueJobs({
      db: await getDb(),
      cfg,
      trigger: "admin",
      only: job ? [job] : undefined,
      force: form.get("force") === "on",
      deadlineMs: 50_000,
    });
    if (report.status === "unconfigured") return { error: "Geen databron geconfigureerd." };
    return { ok: report.status === "ok", lines: report.jobs.map((j) => `${j.status} · ${j.key} · ${j.requests} verzoeken · ${j.message}`) };
  } catch (err) {
    console.error("[beheer]", err instanceof Error ? err.message : err);
    return { error: "De synchronisatie gaf een fout; zie de serverlog." };
  }
}
