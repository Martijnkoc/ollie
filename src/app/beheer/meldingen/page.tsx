import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/Empty";
import { HideForm, ResolveReport } from "@/components/forms/ModerationForms";
import { requireStaff } from "@/lib/access";
import { REPORT_REASONS, label } from "@/lib/config";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Meldingen", robots: { index: false } };

const CONTEXT: Record<string, string> = {
  profile: "profiel",
  service: "dienst",
  portfolio: "portfolio-item",
  review: "review",
  message: "bericht",
  order: "opdracht",
};
const LINK: Record<string, (id: string) => string | null> = {
  service: (id) => `/diensten/${id}`,
  portfolio: (id) => `/werk/${id}`,
  order: (id) => `/opdrachten/${id}`,
  profile: () => null,
  review: () => null,
  message: () => null,
};

export default async function ReportsPage() {
  await requireStaff();
  const reports = await (
    await getDb()
  ).query<{
    id: string;
    target_id: string | null;
    target_name: string | null;
    reporter_name: string | null;
    context: string;
    context_id: string;
    excerpt: string;
    reason: string;
    details: string;
    status: string;
    created_at: Date;
    resolution: string | null;
  }>(
    `select r.id, r.target_id, tp.display_name as target_name, rp.display_name as reporter_name, r.context, r.context_id, r.excerpt, r.reason, r.details,
       r.status, r.created_at, r.resolution
     from reports r left join profiles tp on tp.user_id = r.target_id left join profiles rp on rp.user_id = r.reporter_id
     order by (r.status = 'open') desc, r.created_at desc limit 200`,
  );
  return (
    <>
      <div>
        <h1>Meldingen</h1>
        <p className="muted">Beoordeel elke melding zelf en leg je besluit vast. Niets wordt automatisch gesanctioneerd.</p>
      </div>
      {reports.length === 0 ? (
        <Empty title="Geen meldingen" />
      ) : (
        <ul className="list">
          {reports.map((r) => {
            const link = LINK[r.context]?.(r.context_id);
            return (
              <li key={r.id} className="card stack">
                <div className="row between">
                  <strong>{label(REPORT_REASONS, r.reason)}</strong>
                  <span className={`badge ${r.status === "open" ? "bad" : ""}`}>
                    {r.status === "open" ? "Open" : r.status === "actioned" ? "Afgehandeld" : "Afgewezen"}
                  </span>
                </div>
                <p className="muted small" style={{ margin: 0 }}>
                  {CONTEXT[r.context]} van{" "}
                  {r.target_id ? (
                    <Link href={`/beheer/gebruikers/${r.target_id}`}>{r.target_name ?? "account zonder profiel"}</Link>
                  ) : (
                    "verwijderd account"
                  )}{" "}
                  · gemeld door {r.reporter_name ?? "verwijderd account"} · {formatDateTime(r.created_at)}{" "}
                  {link && <Link href={link}>· bekijken</Link>}
                </p>
                {r.excerpt && (
                  <blockquote className="card tight pre" style={{ margin: 0 }}>
                    {r.excerpt}
                  </blockquote>
                )}
                {r.details && (
                  <p className="pre" style={{ margin: 0 }}>
                    {r.details}
                  </p>
                )}
                {r.status === "open" ? (
                  <>
                    {["service", "portfolio", "review", "profile"].includes(r.context) && (
                      <details>
                        <summary className="small">Deze inhoud verbergen</summary>
                        <HideForm context={r.context as "service"} id={r.context_id} hide />
                      </details>
                    )}
                    <ResolveReport reportId={r.id} />
                  </>
                ) : (
                  <p className="small muted" style={{ margin: 0 }}>
                    Besluit: {r.resolution}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
