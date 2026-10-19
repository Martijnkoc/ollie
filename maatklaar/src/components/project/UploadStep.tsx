"use client";

import { useId, useRef, useState } from "react";
import { ACCEPTED_FILES, LIMITS } from "@/config/site";
import { inspectFile } from "@/lib/documents/render";
import type { PlanDocument } from "@/lib/projects/schema";
import { deleteFile, keepFileForSession, saveFile } from "@/lib/projects/store";
import { STAGE_LABEL, useAnalyzer } from "./useAnalyzer";
import type { StepProps } from "./types";

const QUALITY_TEXT = {
  goed: "Goed leesbaar",
  matig: "Deels leesbaar — controleer extra goed",
  onvoldoende: "Onvoldoende leesbaar — vul de maten zelf in of kalibreer",
} as const;

export function UploadStep({ project, update, goTo }: StepProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [keepOnDevice, setKeepOnDevice] = useState(true);
  const { state: analysis, run } = useAnalyzer(project.id, update);

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    setNotes([]);
    setChecking(true);
    const inspection = await inspectFile(file);
    setChecking(false);
    if (!inspection.ok) {
      setError(inspection.error);
      return;
    }
    setNotes(inspection.notes);
    const doc: PlanDocument = {
      kind: inspection.kind,
      sizeBytes: file.size,
      fileName: file.name.slice(0, 200),
      pages: inspection.pages,
      selectedPage: 0,
      storedOnDevice: keepOnDevice,
    };
    if (keepOnDevice) await saveFile(project.id, file).catch(() => keepFileForSession(project.id, file));
    else {
      await deleteFile(project.id);
      keepFileForSession(project.id, file);
    }
    // A new file starts a new analysis; scales and analyses of the old file no longer apply.
    update((p) => ({ ...p, document: doc, analyses: [], scales: [] }));
    await run(doc, 0, file);
  }

  async function removeFile() {
    await deleteFile(project.id);
    update((p) => (p.document ? { ...p, document: { ...p.document, storedOnDevice: false } } : p));
  }

  const doc = project.document;
  const running = analysis && !analysis.done;
  const summary = project.analyses.find((a) => a.page === (analysis?.page ?? 0));

  return (
    <section className="panel stack" aria-labelledby="stap-plattegrond">
      <div className="panel-head">
        <div>
          <h2 id="stap-plattegrond" tabIndex={-1}>
            Voeg je plattegrond toe
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Upload de plattegrond die je bijvoorbeeld van de makelaar hebt ontvangen. Een bouwtekening met zichtbare maatvoering werkt het
            best.
          </p>
        </div>
      </div>

      <label
        htmlFor={inputId}
        className="dropzone"
        data-over={over}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handle(e.dataTransfer.files[0]);
        }}
      >
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
          <rect x="7" y="5" width="30" height="34" rx="5" fill="none" stroke="#1f4d3a" strokeWidth="2" />
          <path d="M13 15h18M13 21h10M22 21v10M13 31h18" stroke="#2b6a50" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <strong>Sleep je bestand hierheen of kies een bestand</strong>
        <span className="small muted">
          {ACCEPTED_FILES.label} · maximaal {Math.round(LIMITS.maxUploadBytes / 1024 / 1024)} MB · PDF tot {LIMITS.maxPdfPages}{" "}
          pagina&apos;s
        </span>
        <span className="btn btn-sm">Bestand kiezen</span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED_FILES.accept}
          className="visually-hidden"
          onChange={(e) => {
            void handle(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      <ul className="chips" aria-label="Voorbeelden van bestanden die goed werken">
        <li>PDF van de makelaar</li>
        <li>Bouwtekening met maten</li>
        <li>Foto of scan van een tekening</li>
      </ul>
      <p className="small muted" style={{ margin: 0 }}>
        Niet elk bestand is automatisch goed te lezen. Je kunt alles controleren en aanpassen, of de kamers zelf invoeren. Gebruik alleen
        een bestand dat je mag gebruiken.
      </p>

      <label className="check small">
        <input type="checkbox" checked={keepOnDevice} onChange={(e) => setKeepOnDevice(e.target.checked)} />
        <span>
          Bewaar het bestand op dit apparaat, zodat je na verversen of betalen verder kunt. Het gaat nooit naar onze server en wordt na{" "}
          {LIMITS.projectExpiryDays} dagen zonder wijzigingen gewist.
        </span>
      </label>

      <div aria-live="polite" className="stack-sm">
        {checking && <p className="notice">Bestand controleren…</p>}
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        {notes.length > 0 && (
          <div className="notice notice-warn">
            <ul>
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        {analysis && (
          <div className="card-flat">
            <h3>We lezen je plattegrond</h3>
            <ol className="progress-steps">
              <li data-state="done">
                <span className="progress-dot" aria-hidden="true">
                  ✓
                </span>
                <span>Bestand gecontroleerd (type, grootte, pagina&apos;s)</span>
              </li>
              {analysis.stage && (
                <li data-state="running">
                  <span className="progress-dot" aria-hidden="true" />
                  <span>
                    {STAGE_LABEL[analysis.stage.stage]}
                    {analysis.stage.stage === "ocr" && analysis.stage.fraction !== undefined
                      ? ` — ${Math.round(analysis.stage.fraction * 100)}%`
                      : ""}
                  </span>
                </li>
              )}
              {analysis.done && !analysis.error && (
                <li data-state="done">
                  <span className="progress-dot" aria-hidden="true">
                    ✓
                  </span>
                  <span>Analyse klaar</span>
                </li>
              )}
              {analysis.error && (
                <li data-state="failed">
                  <span className="progress-dot" aria-hidden="true">
                    !
                  </span>
                  <span>{analysis.error}</span>
                </li>
              )}
            </ol>
            {analysis.stage?.stage === "ocr" && analysis.stage.fraction !== undefined && (
              <div className="bar" style={{ marginTop: 10 }} aria-hidden="true">
                <span style={{ width: `${Math.round(analysis.stage.fraction * 100)}%` }} />
              </div>
            )}
          </div>
        )}
      </div>

      {doc && summary && !running && (
        <div className="card-flat stack-sm">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Wat we vonden</h3>
            <span className="badge badge-neutral">
              {summary.method === "ocr" ? "Gelezen met OCR" : "Tekst uit PDF"} · {QUALITY_TEXT[summary.quality]}
            </span>
          </div>
          {summary.findings.length ? (
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {summary.findings.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              We vonden geen kamernamen of maten. Dat is geen probleem: je kunt de kamers tekenen of de maten invullen.
            </p>
          )}
          {summary.reasons.length > 0 && (
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
              {summary.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <p className="small" style={{ margin: 0 }}>
            Alles wat we vonden is een suggestie met het label <em>automatisch herkend</em>. In de volgende stap controleer je elke kamer.
          </p>
        </div>
      )}

      {doc && (
        <div className="row small muted">
          <span>
            Huidig bestand: {doc.kind.toUpperCase()}, {doc.pages.length} {doc.pages.length === 1 ? "pagina" : "pagina's"}
            {doc.storedOnDevice ? ", bewaard op dit apparaat" : ", niet bewaard"}
          </span>
          {doc.storedOnDevice && (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void removeFile()}>
              Verwijder bestand van dit apparaat
            </button>
          )}
        </div>
      )}

      <div className="row">
        <button type="button" className="btn btn-primary" disabled={Boolean(running)} onClick={() => goTo("kamers")}>
          {doc ? "Kamers controleren" : "Zonder plattegrond verder (handmatig)"}
        </button>
      </div>
    </section>
  );
}
