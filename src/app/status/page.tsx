import type { Metadata } from "next";
import { connection } from "next/server";
import { JobTable } from "@/components/JobTable";
import { SyncTime } from "@/components/SyncTime";
import { siteStatus } from "@/lib/data";
import { getDb } from "@/lib/db";
import { config } from "@/lib/env";
import { syncOverview } from "@/lib/sync/overview";

export const metadata: Metadata = {
  title: "Synchronisatiestatus",
  description: "Hoe actueel de gegevens op Voetbalradar zijn.",
  robots: { index: false, follow: false },
};

const MODE: Record<string, string> = {
  live: "Echte gegevens",
  demo: "Demo-omgeving met fictieve gegevens",
  unconfigured: "Geen databron gekoppeld",
};

export default async function StatusPage() {
  await connection();
  const cfg = config();
  let overview: Awaited<ReturnType<typeof syncOverview>> | null = null;
  let dbError = false;
  let status = await siteStatus(null, cfg);
  if (cfg.provider) {
    try {
      const db = await getDb();
      overview = await syncOverview(db, cfg.provider);
      status = await siteStatus(db, cfg);
    } catch {
      dbError = true;
    }
  }
  return (
    <div className="container page stack" style={{ maxWidth: 960 }}>
      <div className="page-head">
        <h1>Synchronisatiestatus</h1>
        <p className="muted">Wat we tonen en hoe recent het is bijgewerkt.</p>
      </div>
      <section className="card">
        <div className="card-body">
          <dl className="kv">
            <dt>Modus</dt>
            <dd>{MODE[cfg.dataMode]}</dd>
            <dt>Databron</dt>
            <dd>{status.providerLabel ?? "–"}</dd>
            <dt>Live-gegevens</dt>
            <dd>
              <SyncTime iso={status.lastLiveSync} prefix="Laatst geslaagd" />
            </dd>
            <dt>Programma</dt>
            <dd>
              <SyncTime iso={status.lastSync} prefix="Laatst geslaagd" />
            </dd>
            <dt>Toestand</dt>
            <dd>
              {dbError
                ? "Database niet bereikbaar"
                : status.degraded
                  ? "Loopt achter"
                  : cfg.dataMode === "unconfigured"
                    ? "Niet actief"
                    : "Normaal"}
            </dd>
          </dl>
        </div>
      </section>
      {overview && (
        <section className="card">
          <div className="card-head">
            <h2>Taken</h2>
          </div>
          <JobTable jobs={overview.jobs} showErrors={false} />
        </section>
      )}
    </div>
  );
}
