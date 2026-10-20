"use client";

import { useEffect, useRef, useState } from "react";
import { AR_MEASURE } from "@/config/scantag";
import { formatMm } from "@/lib/format";
import { arError, detectCapabilities, unsupportedReason, type Capabilities } from "@/lib/measurements/capabilities";
import {
  combinedValues,
  newShotId,
  pointFromSamples,
  SCAN_REASONS,
  SCAN_STATUS_LABELS,
  SCAN_TASKS,
  shownMarginMm,
  type HitSample,
  type ScanPoint,
  type ScanShot,
  type ScanTarget,
  type ScanTask,
  type TargetVerdict,
} from "@/lib/measurements/scan";
import { MEASURE_INFO, type MeasureKey } from "@/lib/measurements/schema";
import { startArSession, type ArFeatures, type ArFrame, type ArHandle } from "./ar-session";
import { ScanDiagram } from "./ScanDiagram";

export const targetLabel = (t: ScanTarget) => (t === "plafondhoogte" ? "Plafondhoogte" : MEASURE_INFO[t as MeasureKey].label);

/** The server's verdicts; "local" for a free measurement checked on the device (ceiling height). */
type Verdicts = Partial<Record<ScanTarget, TargetVerdict>> | null | "local";
type Live = { tracking: boolean; found: boolean; dots: { x: number; y: number }[]; holding: number | null };
type Capture = {
  task: ScanTask;
  points: ScanPoint[];
  samples: HitSample[] | null;
  waited: number;
  frames: number;
  lost: number;
  features: ArFeatures | null;
};

/** The state of one task without any size: what may be shown before payment. */
function taskState(task: ScanTask, own: ScanShot[], verdicts: Verdicts, online: boolean) {
  const targets = task.targets.filter((t): t is ScanTarget => t !== null);
  if (!own.length) return { text: "Nog niet gescand", status: undefined, reasons: [] as string[] };
  if (verdicts === "local") {
    const ok = own.some((s) => s.quality.status === "ok");
    const reasons = [...new Set(own.flatMap((s) => s.quality.reasons))].map((r) => SCAN_REASONS[r]);
    return ok
      ? { text: "Gemeten", status: "measured", reasons: [] as string[] }
      : { text: SCAN_STATUS_LABELS.retake_required, status: "check", reasons };
  }
  if (own.some((s) => !s.processed) || !verdicts || targets.some((t) => !verdicts[t]))
    return {
      text: online ? "Wordt gecontroleerd" : "Bewaard; wordt gecontroleerd zodra je online bent",
      status: "auto",
      reasons: [] as string[],
    };
  const list = targets.map((t) => verdicts[t]!);
  const reasons = [...new Set(list.flatMap((v) => v.reasons))].map((r) => SCAN_REASONS[r]);
  if (list.some((v) => v.status === "retake_required")) return { text: SCAN_STATUS_LABELS.retake_required, status: "check", reasons };
  if (list.some((v) => v.status === "not_supported_for_ordering"))
    return { text: `Gescand · ${SCAN_STATUS_LABELS.not_supported_for_ordering.toLowerCase()}`, status: "measured", reasons };
  return { text: `Gescand · ${SCAN_STATUS_LABELS.accepted.toLowerCase()}`, status: "confirmed", reasons };
}

/**
 * ScanTag: measuring a window (or the ceiling height) with the phone's AR tracking. Per task a short guided
 * capture: aim the cross-hair at each point and hold still while it records the hits of many frames. No paper,
 * no tape measure, no photo is kept. Before payment (`reveal` false) only statuses are shown; the sizes come
 * from the server after a verified payment.
 */
export function ArScan({
  heading,
  tasks,
  shots,
  verdicts,
  reveal,
  onSave,
  onOtherDevice,
  onClose,
}: {
  heading: string;
  tasks: ScanTask[];
  shots: ScanShot[];
  verdicts: Verdicts;
  reveal: boolean;
  onSave: (shots: ScanShot[]) => void;
  /** Continue on a phone that can scan (QR link); absent where that makes no sense. */
  onOtherDevice?: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const handle = useRef<ArHandle | null>(null);
  const capture = useRef<Capture | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [view, setView] = useState<{ kind: "overview" } | { kind: "intro"; task: ScanTask } | { kind: "ar"; task: ScanTask }>(
    tasks.length === 1 && !shots.length ? { kind: "intro", task: tasks[0]! } : { kind: "overview" },
  );
  const [live, setLive] = useState<Live>({ tracking: false, found: false, dots: [], holding: null });
  const [pointCount, setPointCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    void detectCapabilities().then(setCaps);
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      void handle.current?.end();
    };
  }, []);

  const reason = caps ? unsupportedReason(caps) : null;

  function finishShot(c: Capture) {
    const shot: ScanShot = {
      id: newShotId(),
      task: c.task.id,
      takenAt: new Date().toISOString(),
      points: c.points,
      tracking: { frames: c.frames, lost: c.lost },
      device: {
        webxr: true,
        hitTest: c.features?.hitTest ?? true,
        depthSensing: c.features?.depthSensing ?? false,
        domOverlay: c.features?.domOverlay ?? true,
        platform: caps?.platform ?? "onbekend",
        browser: caps?.browser ?? "onbekend",
      },
      values: {},
      processed: false,
      quality: { status: "ok", reasons: [] },
    };
    onSave([...shots, shot]);
  }

  function onFrame(f: ArFrame) {
    const c = capture.current;
    if (!c) return;
    c.frames++;
    if (!f.tracking) c.lost++;
    if (c.samples) {
      c.waited++;
      if (f.tracking && f.hit) c.samples.push({ p: f.hit.p, n: f.hit.n, rangeM: f.hit.rangeM, depthDiffMm: f.depthDiffMm });
      const enough = c.samples.length >= AR_MEASURE.framesPerPoint;
      if (enough || c.waited > AR_MEASURE.framesPerPoint * 4) {
        const point = pointFromSamples(c.samples);
        c.samples = null;
        if (!point) setError("Hier vond je telefoon geen oppervlak. Beweeg rustig heen en weer en probeer het opnieuw.");
        else {
          c.points.push(point);
          setPointCount(c.points.length);
          setError(null);
          if (c.points.length === c.task.points.length) {
            finishShot(c);
            capture.current = null;
            void handle.current?.end();
            return;
          }
        }
      }
    }
    // The overlay is redrawn every other frame: enough to follow the phone, light on the device.
    if (c.frames % 2) return;
    setLive({
      tracking: f.tracking,
      found: Boolean(f.hit) && f.tracking,
      dots: c.points.map((p) => f.toScreen(p.p)).filter((d): d is { x: number; y: number } => d !== null),
      holding: c.samples ? c.samples.length : null,
    });
  }

  async function startAr(task: ScanTask) {
    setError(null);
    setPointCount(0);
    setView({ kind: "ar", task });
    capture.current = { task, points: [], samples: null, waited: 0, frames: 0, lost: 0, features: null };
    try {
      // The overlay must be on screen before the session takes it over.
      await new Promise((r) => requestAnimationFrame(r));
      handle.current = await startArSession(overlay.current!, onFrame, () => {
        handle.current = null;
        capture.current = null;
        setView({ kind: "overview" });
      });
      if (capture.current) capture.current.features = handle.current.features;
    } catch (err) {
      capture.current = null;
      setError(arError(err));
      setView({ kind: "intro", task });
    }
  }

  const hold = () => {
    const c = capture.current;
    if (c && !c.samples) {
      c.samples = [];
      c.waited = 0;
    }
  };
  const undo = () => {
    const c = capture.current;
    if (c && !c.samples && c.points.length) {
      c.points.pop();
      setPointCount(c.points.length);
    }
  };
  const remove = (s: ScanShot) => onSave(shots.filter((x) => x.id !== s.id));

  const values = reveal ? combinedValues(shots) : {};

  return (
    <dialog ref={dialog} className="sheet sheet-wide" aria-labelledby="scan-titel" onClose={onClose} onCancel={onClose}>
      <div className="sheet-head">
        <div>
          <p className="tiny muted" style={{ margin: 0 }}>
            {heading}
          </p>
          <h2 id="scan-titel" style={{ fontSize: "1.3rem", margin: 0 }}>
            ScanTag: meten met je telefoon
          </h2>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => dialog.current?.close()} aria-label="Sluiten">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="sheet-body">
        {caps && reason && view.kind !== "ar" && (
          <div className="notice notice-warn stack-sm" role="status">
            <strong>Automatisch inmeten kan niet op dit toestel</strong>
            <span className="small">{reason}</span>
            <span className="small">
              Status: {SCAN_STATUS_LABELS.not_supported_for_ordering.toLowerCase()} — we maken van pixels geen millimeters.
            </span>
            {onOtherDevice && (
              <div>
                <button type="button" className="btn btn-sm btn-primary" onClick={onOtherDevice}>
                  Verder op een telefoon die kan scannen
                </button>
              </div>
            )}
          </div>
        )}

        {view.kind === "overview" && (
          <>
            <p className="small" style={{ margin: 0 }}>
              Je telefoon meet met zijn eigen AR-tracking: je richt het vizier op een hoek, houdt even stil, en hij legt vast waar die hoek
              in de ruimte zit. Geen papier, geen rolmaat. Er wordt geen foto bewaard; alleen de vastgelegde punten gaan naar ons om de scan
              te controleren.
            </p>
            <ul className="task-list" aria-label="Wat je scant">
              {tasks.map((task) => {
                const own = shots.filter((s) => s.task === task.id);
                const state = taskState(task, own, verdicts, online);
                const targets = task.targets.filter((t): t is ScanTarget => t !== null);
                return (
                  <li key={task.id} className="card-flat stack-sm">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong>{task.title}</strong>
                      <span className={`badge ${state.status ? "" : "badge-neutral"}`} data-status={state.status}>
                        {own.length ? `${own.length} scan${own.length > 1 ? "s" : ""} · ` : ""}
                        {state.text}
                      </span>
                    </div>
                    {state.reasons.length > 0 && (
                      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                        {state.reasons.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    )}
                    {reveal && targets.some((t) => values[t]) && (
                      <ul className="small measure-list" style={{ margin: 0, paddingLeft: 18 }}>
                        {targets
                          .filter((t) => values[t])
                          .map((t) => (
                            <li key={t}>
                              {targetLabel(t)}: <span className="num">{formatMm(values[t]!.mm)}</span> ±{" "}
                              {formatMm(shownMarginMm(values[t]!.uncertaintyMm))}
                            </li>
                          ))}
                      </ul>
                    )}
                    {!reveal && own.some((s) => s.processed && s.quality.status === "ok") && (
                      <p className="small" style={{ margin: 0 }}>
                        De maten uit deze scan zie je na het ontgrendelen van je rapport.
                      </p>
                    )}
                    <div className="row">
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={Boolean(reason)}
                        onClick={() => setView({ kind: "intro", task })}
                      >
                        {own.length ? "Nog een keer scannen" : "Scannen"}
                      </button>
                      {own.map((s, i) => (
                        <button
                          key={s.id}
                          type="button"
                          className="btn btn-sm btn-ghost"
                          aria-label={`Scan ${i + 1} van ${task.title.toLowerCase()} verwijderen`}
                          onClick={() => remove(s)}
                        >
                          Scan {i + 1} verwijderen
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="tiny muted" style={{ margin: 0 }}>
              Elke maat krijgt een foutmarge: hoe stil elk punt lag, hoe ver je stond, en een vaste marge van{" "}
              {String(AR_MEASURE.scalePercent).replace(".", ",")} % voor de schaal van de tracking. Die vaste marge is een aanname tot we
              genoeg ramen met ScanTag én een gekalibreerd meetinstrument hebben vergeleken. Tot dan rekenen we met ScanTag-maten geen
              bestelmaat uit.
            </p>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => dialog.current?.close()}>
                Klaar
              </button>
              {reveal && shots.length > 0 && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => exportForValidation(heading, shots)}>
                  Exporteren voor validatie
                </button>
              )}
            </div>
          </>
        )}

        {view.kind === "intro" && (
          <>
            <h3 style={{ margin: 0 }}>{view.task.title}</h3>
            <div className="scan-diagram-wrap">
              <ScanDiagram task={view.task.id} />
            </div>
            <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
              {view.task.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            {error && (
              <p className="notice notice-warn small" role="alert" style={{ margin: 0 }}>
                {error}
              </p>
            )}
            <div className="row">
              <button type="button" className="btn btn-primary" disabled={!caps || Boolean(reason)} onClick={() => void startAr(view.task)}>
                Start de scan
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setView({ kind: "overview" })}>
                Terug
              </button>
            </div>
            <p className="tiny muted" style={{ margin: 0 }}>
              De camera start pas als je op &ldquo;Start de scan&rdquo; tikt. Je browser vraagt dan om toestemming.
            </p>
          </>
        )}

        <div ref={overlay} className="ar-overlay" hidden={view.kind !== "ar"} aria-hidden={view.kind !== "ar"}>
          {view.kind === "ar" && (
            <>
              <div className="ar-top">
                <strong>{view.task.title}</strong>
                <span aria-live="polite">
                  {pointCount < view.task.points.length
                    ? `Punt ${pointCount + 1} van ${view.task.points.length}: ${view.task.points[pointCount]}`
                    : "Klaar"}
                </span>
              </div>
              <svg className="ar-dots" aria-hidden="true">
                {live.dots.map((d, i) => (
                  <circle key={i} cx={d.x} cy={d.y} r={7} />
                ))}
                {view.task.kind === "rect" &&
                  live.dots.slice(1).map((d, i) => <line key={i} x1={live.dots[i]!.x} y1={live.dots[i]!.y} x2={d.x} y2={d.y} />)}
              </svg>
              <span className="ar-reticle" data-found={live.found} aria-hidden="true" />
              <div className="ar-bottom">
                <p className="ar-status" role="status">
                  {live.holding !== null
                    ? `Stil houden… ${live.holding} van ${AR_MEASURE.framesPerPoint}`
                    : !live.tracking
                      ? "Beweeg je telefoon rustig: hij zoekt zijn positie."
                      : !live.found
                        ? "Beweeg rustig heen en weer tot het vizier groen wordt."
                        : `Richt op: ${view.task.points[pointCount] ?? ""}`}
                </p>
                {error && (
                  <p className="ar-status" role="alert">
                    {error}
                  </p>
                )}
                <div className="row" style={{ justifyContent: "center" }}>
                  <button type="button" className="btn btn-primary" disabled={!live.found || live.holding !== null} onClick={hold}>
                    Vastleggen
                  </button>
                  <button type="button" className="btn" disabled={!pointCount || live.holding !== null} onClick={undo}>
                    Punt terug
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => void handle.current?.end()}>
                    Stoppen
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

/**
 * Downloads the scans in the validation format (validation/scantag.run.ts): points, device and values, no image.
 * Whoever validates fills in the reference values from a calibrated instrument.
 */
function exportForValidation(heading: string, shots: ScanShot[]) {
  const records = shots.map((s) => ({
    naam: `${heading} · ${SCAN_TASKS[s.task].title} · ${s.takenAt}`,
    task: s.task,
    points: s.points,
    tracking: s.tracking,
    device: s.device,
    scanTag: s.values,
    waarheid: {},
    instrument: "",
    tolerantieMm: 5,
  }));
  const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "scantag-validatie.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
