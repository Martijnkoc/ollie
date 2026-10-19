"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeProject } from "@/lib/projects/compute";
import { deleteProject } from "@/lib/projects/store";
import { AddressStep } from "./AddressStep";
import { FloorStep } from "./FloorStep";
import { PaidStep } from "./PaidStep";
import { ReportStep } from "./ReportStep";
import { RoomsStep } from "./RoomsStep";
import { UploadStep } from "./UploadStep";
import { STEPS, type PaymentInfo, type StepKey, type StepProps } from "./types";
import { useProject } from "./useProject";
import { refreshPayment } from "./payment-client";

export function ProjectApp({ id, payment }: { id: string; payment: PaymentInfo }) {
  const { status, project, update, flush, discard, saveState, persistent } = useProject(id);
  const router = useRouter();
  const [step, setStep] = useState<StepKey>("woning");
  const headingRef = useRef<HTMLDivElement>(null);
  const checkedPayment = useRef(false);

  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as StepKey;
    if (STEPS.some((s) => s.key === fromHash)) setStep(fromHash);
  }, []);

  const goTo = useCallback((next: StepKey) => {
    setStep(next);
    history.replaceState(null, "", `#${next}`);
    requestAnimationFrame(() => {
      headingRef.current?.scrollIntoView({ block: "start" });
      headingRef.current?.querySelector<HTMLElement>("h2")?.focus();
    });
  }, []);

  // A payment that was started but not yet confirmed (e.g. the user came back another way): ask the server.
  useEffect(() => {
    if (status !== "ready" || !project?.payment || checkedPayment.current) return;
    checkedPayment.current = true;
    const p = project.payment;
    const stale = Date.now() - new Date(p.checkedAt).getTime() > 6 * 3600 * 1000;
    if (p.status === "paid" && !stale) return;
    if (p.status !== "open" && p.status !== "pending" && p.status !== "paid") return;
    refreshPayment(p)
      .then((next) => next && update((prev) => ({ ...prev, payment: next })))
      .catch(() => undefined);
  }, [status, project, update]);

  const computed = useMemo(() => (project ? computeProject(project) : null), [project]);

  if (status === "loading") {
    return (
      <div className="container app-shell" aria-busy="true">
        <p className="muted">Project laden…</p>
      </div>
    );
  }
  if (status === "missing" || !project || !computed) {
    return (
      <div className="container app-shell">
        <div className="panel stack">
          <h1>Project niet gevonden op dit apparaat</h1>
          <p className="muted">
            Projecten staan alleen in de browser waarin je ze maakte, en worden na een tijd zonder wijzigingen automatisch gewist. Open MaatKlaar in die browser, of begin
            een nieuw project.
          </p>
          <div className="row">
            <Link className="btn btn-primary" href="/project/nieuw">
              Nieuw project
            </Link>
            <Link className="btn" href="/project">
              Mijn projecten
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const remove = async () => {
    discard();
    await deleteProject(project.id);
    router.replace("/project");
  };
  const props: StepProps = { project, update, computed, goTo, flush, remove, payment };
  const index = STEPS.findIndex((s) => s.key === step);
  const done: Record<StepKey, boolean> = {
    woning: Boolean(project.address),
    plattegrond: Boolean(project.document),
    kamers: project.rooms.length > 0,
    vloer: computed.floor.requiredM2 !== null,
    "plinten-ramen": project.payment?.status === "paid",
    rapport: false,
  };

  return (
    <div className="container app-shell">
      <div className="app-head">
        <div>
          <label className="visually-hidden" htmlFor="project-name">
            Projectnaam
          </label>
          <input
            id="project-name"
            className="input"
            style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 560, border: "none", background: "transparent", padding: "4px 0", minHeight: 0 }}
            value={project.name}
            maxLength={80}
            onChange={(e) => update((p) => ({ ...p, name: e.target.value || "Mijn woning" }))}
          />
          <p className="tiny muted" role="status" style={{ margin: 0 }}>
            {saveState === "error" ? "Opslaan mislukt. Je wijzigingen staan alleen in dit venster." : saveState === "saving" ? "Opslaan…" : "Opgeslagen op dit apparaat"}
            {!persistent ? " · Let op: je browser staat lokaal opslaan niet toe; bij verversen gaat je project verloren." : ""}
          </p>
        </div>
        <Link href="/project" className="btn btn-sm btn-ghost">
          Alle projecten
        </Link>
      </div>

      <nav aria-label="Stappen">
        <ol className="stepper">
          {STEPS.map((s, i) => (
            <li key={s.key} className={done[s.key] ? "done" : undefined}>
              <button type="button" aria-current={s.key === step ? "step" : undefined} onClick={() => goTo(s.key)}>
                <span className="num" aria-hidden="true">
                  {done[s.key] && s.key !== step ? "✓" : i + 1}
                </span>
                {s.label}
                {done[s.key] ? <span className="visually-hidden"> (klaar)</span> : null}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div ref={headingRef} style={{ scrollMarginTop: 80 }}>
        {step === "woning" && <AddressStep {...props} />}
        {step === "plattegrond" && <UploadStep {...props} />}
        {step === "kamers" && <RoomsStep {...props} />}
        {step === "vloer" && <FloorStep {...props} />}
        {step === "plinten-ramen" && <PaidStep {...props} />}
        {step === "rapport" && <ReportStep {...props} />}
      </div>

      <div className="row" style={{ justifyContent: "space-between", marginTop: 20 }}>
        {index > 0 ? (
          <button type="button" className="btn" onClick={() => goTo(STEPS[index - 1]!.key)}>
            ← {STEPS[index - 1]!.label}
          </button>
        ) : (
          <span />
        )}
        {index < STEPS.length - 1 ? (
          <button type="button" className="btn btn-primary" onClick={() => goTo(STEPS[index + 1]!.key)}>
            {STEPS[index + 1]!.label} →
          </button>
        ) : null}
      </div>
    </div>
  );
}
