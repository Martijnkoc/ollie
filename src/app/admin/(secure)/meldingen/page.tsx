import { hideMemberAction, reportHandledAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { listReports, requireAdmin } from "@/lib/admin";
import { REPORT_REASONS, label } from "@/lib/config";
import { getDb } from "@/lib/db";
import { formatShort } from "@/lib/time";

export default async function ReportsPage() {
  await requireAdmin();
  const reports = await listReports(await getDb());
  return (
    <>
      <div>
        <h1>Meldingen</h1>
        <p className="muted">Meldingen staan los van feedback. Behandel ze vertrouwelijk.</p>
      </div>
      {reports.length === 0 ? (
        <p className="notice">Geen meldingen.</p>
      ) : (
        <div className="stack">
          {reports.map((r) => (
            <div key={r.id} className="card flat stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{label(REPORT_REASONS, r.reason)}</strong>
                <span className={`badge ${r.status === "open" ? "bad" : ""}`}>{r.status === "open" ? "Open" : "Afgehandeld"}</span>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {r.reporter_name} meldt {r.reported_name}
                {r.reported_email ? ` (${r.reported_email})` : ""} · date van {formatShort(r.starts_at)} ·{" "}
                {r.source === "community" ? "community" : "uitnodiging"} · gemeld {formatShort(r.created_at)}
              </p>
              {r.details && <p style={{ whiteSpace: "pre-wrap" }}>{r.details}</p>}
              {r.status === "open" && (
                <div className="row">
                  <ActionForm action={reportHandledAction.bind(null, r.id)}>
                    <SubmitButton className="btn secondary">Afgehandeld</SubmitButton>
                  </ActionForm>
                  {r.reported_member_id && (
                    <ActionForm action={hideMemberAction.bind(null, r.reported_member_id, "/admin/meldingen")}>
                      <SubmitButton className="btn danger">Lid uit voorstellen halen</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
