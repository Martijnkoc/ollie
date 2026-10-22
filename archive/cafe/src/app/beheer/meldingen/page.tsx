import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/Empty";
import { ResolveReport } from "@/components/forms/ModerationForms";
import { requireStaff } from "@/lib/access";
import { REPORT_REASONS, label } from "@/lib/config";
import { getDb } from "@/lib/db";
import { formatShort } from "@/lib/time";

export const metadata: Metadata = { title: "Meldingen", robots: { index: false } };

const CONTEXT: Record<string, string> = {
  message: "bericht aan tafel",
  thread_message: "privébericht",
  date: "videodate",
  profile: "profiel",
  invite: "uitnodiging",
};

export default async function ReportsPage() {
  await requireStaff();
  const reports = await (
    await getDb()
  ).query<{
    id: string;
    target_id: string | null;
    target_alias: string | null;
    context: string;
    excerpt: string;
    reason: string;
    details: string;
    status: string;
    created_at: Date;
    resolution: string | null;
  }>(
    `select r.id, r.target_id, p.alias as target_alias, r.context, r.excerpt, r.reason, r.details, r.status, r.created_at, r.resolution
     from reports r left join profiles p on p.user_id = r.target_id
     order by (r.status = 'open') desc, r.created_at desc limit 200`,
  );
  return (
    <>
      <div>
        <h1>Meldingen</h1>
        <p className="muted">
          Meldingen staan los van feedback. Een gemiste klik of afwijzing is nooit een reden voor een maatregel. Beoordeel elke melding zelf
          en leg je besluit vast.
        </p>
      </div>
      {reports.length === 0 ? (
        <Empty title="Geen meldingen" />
      ) : (
        <ul className="list">
          {reports.map((r) => (
            <li key={r.id} className="card flat stack">
              <div className="row between">
                <strong>{label(REPORT_REASONS, r.reason)}</strong>
                <span className={`badge ${r.status === "open" ? "bad" : ""}`}>
                  {r.status === "open" ? "Open" : r.status === "actioned" ? "Afgehandeld" : "Afgewezen"}
                </span>
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                Over{" "}
                {r.target_id ? (
                  <Link href={`/beheer/gebruikers/${r.target_id}`}>{r.target_alias ?? "account zonder profiel"}</Link>
                ) : (
                  "verwijderd account"
                )}{" "}
                · {CONTEXT[r.context]} · {formatShort(r.created_at)}
              </p>
              {r.excerpt && (
                <blockquote className="card soft" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                  {r.excerpt}
                </blockquote>
              )}
              {r.details && <p style={{ whiteSpace: "pre-wrap" }}>{r.details}</p>}
              {r.status === "open" ? <ResolveReport reportId={r.id} /> : <p className="small muted">Besluit: {r.resolution}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
