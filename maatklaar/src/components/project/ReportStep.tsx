"use client";

import { useMemo, useState } from "react";
import { buildCsv } from "@/lib/reports/csv";
import { buildReportModel } from "@/lib/reports/model";
import { deleteFile } from "@/lib/projects/store";
import { DemoNotice } from "./PaidStep";
import { isPaid, type StepProps } from "./types";

function download(bytes: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "project";

export function ReportStep({ project, update, computed, goTo, remove }: StepProps) {
  const paid = isPaid(project);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const preview = useMemo(() => buildReportModel(project, computed, { now: new Date(), plan: null }), [project, computed]);

  async function pdf() {
    setBusy(true);
    setError(null);
    try {
      const [{ renderReportPdf }, { planThumbnail }] = await Promise.all([import("@/lib/reports/pdf"), import("@/lib/reports/thumbnail")]);
      const plan = await planThumbnail(project);
      const model = buildReportModel(project, computed, { now: new Date(), plan });
      const { bytes } = await renderReportPdf(model);
      download(bytes as BlobPart, "application/pdf", `maatklaar-${slug(project.name)}.pdf`);
    } catch {
      setError("Het rapport kon niet worden gemaakt. Probeer het opnieuw.");
    }
    setBusy(false);
  }

  return (
    <section className="stack" aria-labelledby="stap-rapport">
      {project.payment?.mode === "demo" && paid && <DemoNotice />}
      <div className="panel stack">
        <div className="panel-head">
          <div>
            <h2 id="stap-rapport" tabIndex={-1}>
              Je rapport
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              Het rapport wordt op je eigen apparaat gemaakt uit je actuele projectgegevens.
            </p>
          </div>
        </div>

        {paid ? (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={project.report.includeAddress}
                disabled={!project.address}
                onChange={(e) => update((p) => ({ ...p, report: { ...p.report, includeAddress: e.target.checked } }))}
              />
              <span>Zet mijn adres in het rapport{project.address ? "" : " (geen adres ingevuld)"}</span>
            </label>
            <div className="row">
              <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => void pdf()}>
                {busy ? "Rapport maken…" : "Download PDF-rapport"}
              </button>
              <button
                type="button"
                className="btn btn-lg"
                onClick={() =>
                  download(
                    buildCsv(computed, { demo: project.payment?.mode === "demo" }),
                    "text/csv;charset=utf-8",
                    `maatklaar-${slug(project.name)}.csv`,
                  )
                }
              >
                Download CSV-bestellijst
              </button>
            </div>
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
          </>
        ) : (
          <div className="notice stack-sm">
            <span>Het PDF-rapport en de CSV-bestellijst horen bij het volledige meetrapport.</span>
            <button type="button" className="btn btn-sm btn-primary" style={{ justifySelf: "start" }} onClick={() => goTo("plinten-ramen")}>
              Bekijk wat je krijgt
            </button>
          </div>
        )}

        <div className="grid-2">
          <div className="card-flat">
            <h3>Dit kun je bestellen</h3>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {(paid ? preview.checklist.order : preview.checklist.order.filter((x) => x.startsWith("Vloer"))).map((x) => (
                <li key={x}>{x}</li>
              ))}
              {preview.checklist.order.length === 0 && <li>Nog niets: rond eerst de openstaande punten af.</li>}
            </ul>
          </div>
          <div className="card-flat">
            <h3>Nog te meten of te bevestigen</h3>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {(paid
                ? preview.checklist.todo
                : preview.checklist.todo.filter((x) => x.startsWith("Vloer") || x.startsWith("Controleer"))
              ).map((x) => (
                <li key={x}>{x}</li>
              ))}
              {preview.checklist.todo.length === 0 && <li>Niets openstaand.</li>}
            </ul>
          </div>
        </div>
      </div>

      <div className="panel stack-sm" aria-labelledby="wissen">
        <h2 id="wissen" style={{ fontSize: "1.25rem" }}>
          Je gegevens
        </h2>
        <p className="small muted" style={{ margin: 0 }}>
          Dit project staat alleen in deze browser. Je plattegrond is nooit naar onze server gestuurd. Op de server staat bij een betaling
          alleen een ordernummer, het bedrag en de status.
        </p>
        <div className="row">
          {project.document?.storedOnDevice && (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={async () => {
                await deleteFile(project.id);
                update((p) => (p.document ? { ...p, document: { ...p.document, storedOnDevice: false } } : p));
              }}
            >
              Verwijder mijn plattegrondbestand
            </button>
          )}
          {!confirmDelete ? (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>
              Verwijder dit project
            </button>
          ) : (
            <span className="row" role="group" aria-label="Bevestig verwijderen">
              <span className="small">Project en bestand definitief verwijderen?</span>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => void remove()}>
                Ja, verwijderen
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(false)}>
                Annuleren
              </button>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
