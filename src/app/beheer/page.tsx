import type { Metadata } from "next";
import { headers } from "next/headers";
import { JobTable } from "@/components/JobTable";
import { SyncForm } from "@/components/SyncForm";
import { hasAdminCredentials } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { config } from "@/lib/env";
import { syncOverview } from "@/lib/sync/overview";
import { formatDate, formatTime } from "@/lib/time";
import { runSyncAction } from "./actions";

export const metadata: Metadata = { title: "Beheer", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const cfg = config();
  if (!hasAdminCredentials((await headers()).get("authorization"), cfg)) {
    return <div className="container page">Geen toegang.</div>;
  }
  const overview = cfg.provider ? await syncOverview(await getDb(), cfg.provider) : null;
  const jobKeys = overview ? [...new Set(["competitions", "fixtures:near", "live", "standings", "teams", "details:backfill", "analyses", "maintenance", ...overview.jobs.map((j) => j.key)])] : [];
  return (
    <div className="container page stack">
      <div className="page-head">
        <h1>Beheer</h1>
        <p className="muted small">Alleen toegankelijk met de beheerdersgegevens. Waarden van geheimen worden nergens getoond.</p>
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Configuratie</h2>
        </div>
        <div className="card-body stack-sm">
          <dl className="kv">
            <dt>Datamodus</dt>
            <dd>{cfg.dataMode}</dd>
            <dt>Databron</dt>
            <dd>{cfg.provider ?? "geen"}</dd>
            <dt>Competities</dt>
            <dd>{cfg.competitions.length ? cfg.competitions.join(", ") : "volledige catalogus"}</dd>
            <dt>Live-interval</dt>
            <dd>{cfg.livePollSeconds} s</dd>
            <dt>Dagbudget databron</dt>
            <dd>{cfg.providerDailyBudget ?? "geen extra limiet"}</dd>
            <dt>Cron-secret</dt>
            <dd>{cfg.cronSecret ? "ingesteld" : "ontbreekt"}</dd>
            <dt>Synchronisatie bij verkeer</dt>
            <dd>{cfg.syncOnTraffic ? "aan" : "uit"}</dd>
            <dt>AI</dt>
            <dd>{cfg.ai.apiKey ? `aan · ${cfg.ai.model} · effort ${cfg.ai.effort} · max ${cfg.ai.dailyLimit}/dag` : "uit (geen ANTHROPIC_API_KEY)"}</dd>
            <dt>Clublogo&apos;s</dt>
            <dd>{cfg.showProviderLogos ? "aan" : "uit (typografische badges)"}</dd>
          </dl>
          {cfg.issues.length > 0 && (
            <div className="notice notice-warn small">
              <strong>Aandachtspunten</strong>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {cfg.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
      {overview && (
        <>
          <section className="card">
            <div className="card-head">
              <h2>Handmatig synchroniseren</h2>
            </div>
            <div className="card-body">
              <SyncForm action={runSyncAction} jobs={jobKeys} />
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Taken</h2>
              <span className="small dim">
                Vandaag {overview.usageToday.requests} verzoeken naar de databron ({overview.usageToday.failures} mislukt)
                {overview.usageToday.rate_remaining !== null ? ` · resterend in limietvenster: ${overview.usageToday.rate_remaining}` : ""}
              </span>
            </div>
            <JobTable jobs={overview.jobs} showErrors />
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Laatste runs</h2>
              <span className="small dim">
                AI afgelopen week: {overview.aiLastWeek.ok} getoond, {overview.aiLastWeek.rejected} afgekeurd, {overview.aiLastWeek.failed} mislukt
              </span>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Start</th>
                    <th scope="col">Taak</th>
                    <th scope="col">Bron</th>
                    <th scope="col">Status</th>
                    <th scope="col">Verzoeken</th>
                    <th scope="col">Melding</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.runs.map((r) => (
                    <tr key={r.id}>
                      <td className="small">
                        {formatDate(r.startedAt)} {formatTime(r.startedAt)}
                      </td>
                      <td className="small">
                        <code>{r.job}</code>
                      </td>
                      <td className="small">{r.trigger}</td>
                      <td className="small">
                        <span className={`badge ${r.status === "success" ? "badge-ok" : r.status === "failed" ? "badge-error" : ""}`}>{r.status}</span>
                      </td>
                      <td className="small">{r.requests}</td>
                      <td className="tiny muted">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
