"use client";

import { useEffect, useId, useRef, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMm } from "@/lib/format";
import { WINDOW_STATUS_LABELS, type WindowStatus } from "@/lib/measurements/evaluate";
import { rulesFor } from "@/lib/measurements/protocols";
import {
  MEASURE_INFO,
  MOUNTING_LABELS,
  PRODUCT_FAMILIES,
  PRODUCT_LABELS,
  mountingsFor,
  type Mounting,
  type ProductFamily,
} from "@/lib/measurements/schema";
import { defaultRuleFor } from "@/lib/measurements/protocols";
import { newWindow } from "@/lib/projects/factory";
import type { ProjectWindow } from "@/lib/projects/schema";
import type { Status } from "@/lib/projects/status";
import { applyScanToWindow, SCAN_REASONS, shownMarginMm, tasksFor, type ScanShot } from "@/lib/measurements/scan";
import { findRule } from "@/lib/measurements/protocols";
import { withAudit } from "@/lib/projects/audit";
import { productRule } from "@/lib/rules";
import { ORDER_STATUS_LABELS, orderSummary, type OrderStatus } from "@/lib/rules/engine";
import { scanStatus, verdictsCurrent } from "@/lib/scantag/status";
import { ArScan } from "./ArScan";
import { mergeWindowResult, processWindows } from "./scantag-client";
import { TransferDialog } from "./TransferDialog";
import { loadReturnContext, sendBack, type ReturnContext } from "./transfer-client";
import { MeasureWizard } from "./MeasureWizard";
import { PlanCanvas } from "./PlanCanvas";
import { usePlanImage } from "./usePlanImage";
import type { StepProps } from "./types";

const STATUS_FOR: Record<WindowStatus, Status> = {
  "nog-meten": "missing",
  afwijking: "check",
  ingevoerd: "auto",
  bevestigd: "confirmed",
};

const ORDER_STATUS_FOR: Record<OrderStatus, Status> = {
  order_ready: "derived",
  rule_not_verified: "check",
  measurement_not_accepted: "check",
  needs_verification: "check",
  needs_more_data: "missing",
  not_suitable: "missing",
  unsupported: "missing",
  measuring_sheet: "confirmed",
};

const SHAPES = { rechthoek: "Rechthoekig raam", erker: "Erker (meerdere vlakken)", afwijkend: "Andere vorm (rond, schuin, boog)" } as const;

/**
 * The window register with ScanTag. Before payment (`paid` false) it shows windows, scans and their status
 * but never a size: scans are checked by the server, sizes are released only after a verified payment.
 */
export function WindowSection({ project, update, computed, paid = true }: StepProps & { paid?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState<{ id: string; resume: boolean } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [scanFor, setScanFor] = useState<string | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [back, setBack] = useState<ReturnContext | null>(null);
  const [backStatus, setBackStatus] = useState<string | null>(null);
  // On a phone that received this project: the way back to the computer, while it is valid.
  useEffect(() => setBack(loadReturnContext(project.id)), [project.id]);
  const doc = project.document;
  const page = doc ? Math.min(doc.selectedPage, doc.pages.length - 1) : 0;
  const image = usePlanImage(project.id, doc, page, doc ? doc.sizeBytes : 0);

  // Every change to a window goes through the audit log.
  const setWindow = (w: ProjectWindow) => update((p) => ({ ...p, windows: p.windows.map((x) => (x.id === w.id ? withAudit(x, w) : x)) }));
  const ruleOf = (windowId: string) => computed.windows.find((c) => c.window.id === windowId)?.rule;
  const saveShots = (windowId: string, shots: ScanShot[]) =>
    update((p) => ({
      ...p,
      windows: p.windows.map((x) => {
        if (x.id !== windowId) return x;
        const rule = ruleOf(windowId);
        const next = { ...x, scans: shots };
        return withAudit(x, rule ? applyScanToWindow(next, rule) : next);
      }),
    }));

  // Scans without a current verdict (new, or product/mounting/shape changed) go to the server; after payment
  // also scans whose measurements were not released yet. One request per change, retried on the next change.
  const asked = useRef(new Set<string>());
  const [processing, setProcessing] = useState<string | null>(null);
  // Back online: try the scans that could not be checked again.
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const on = () => setRetry((n) => n + 1);
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);
  useEffect(() => {
    const due = project.windows.filter(
      (w) =>
        w.scans.length > 0 &&
        (!verdictsCurrent(w.scans, w.scanVerdicts, { product: w.product, mounting: w.mounting, shape: w.shape }) ||
          (paid && w.scans.some((s) => s.quality.status === "ok" && !Object.keys(s.values).length))),
    );
    const key =
      due.map((w) => `${w.id}:${w.product}:${w.mounting}:${w.shape}:${w.scans.map((s) => s.id).join(",")}`).join("|") + `:${paid}`;
    if (!due.length || asked.current.has(key)) return;
    asked.current.add(key);
    setProcessing("Je scans worden gecontroleerd…");
    processWindows(project, due)
      .then(({ released, results }) => {
        setProcessing(null);
        update((p) => ({
          ...p,
          windows: p.windows.map((x) => {
            const r = results.find((y) => y.id === x.id);
            if (!r) return x;
            const next = { ...x, ...mergeWindowResult(x, released, r) };
            const rule = ruleOf(x.id);
            return withAudit(x, rule && released ? applyScanToWindow(next, rule) : next);
          }),
        }));
      })
      .catch(() => {
        asked.current.delete(key);
        setProcessing(navigator.onLine ? "De controle lukte nu niet; we proberen het bij de volgende wijziging opnieuw." : null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid, project.windows, retry]);
  // A new rule may ask for other measurements: scan values follow it, typed values stay.
  const setProduct = (w: ProjectWindow, product: ProductFamily, mounting: Mounting) => {
    const rule = defaultRuleFor(product, mounting);
    setWindow(applyScanToWindow({ ...w, product, mounting, ruleId: rule.id, confirmed: false }, rule));
  };
  const opened = computed.windows.find((x) => x.window.id === open?.id);
  const scanning = computed.windows.find((x) => x.window.id === scanFor);
  const stateOf = (w: ProjectWindow, rule: (typeof computed.windows)[number]["rule"]) =>
    scanStatus(w.scans, tasksFor(rule), w.scanVerdicts, { product: w.product, mounting: w.mounting, shape: w.shape });

  return (
    <section className="panel stack" aria-labelledby={`${id}-title`}>
      <div className="panel-head">
        <div>
          <h2 id={`${id}-title`} tabIndex={-1}>
            {paid ? "Raamregister" : "ScanTag: scan je ramen alvast"}
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            {paid
              ? "Elk raam krijgt een code. Een plattegrond van bovenaf vertelt niet hoe groot een raam echt is: die meet je met ScanTag, de AR-scan van je telefoon. Elke maat houdt zijn bron, foutmarge en status; een bestelmaat rekenen we alleen uit met een gecontroleerde meetregel en maten die daarvoor geschikt zijn."
              : "Scan je ramen met je telefoon: richt op de hoeken van elk raam en houd even stil. Geen papier, geen rolmaat. We controleren elke scan; de maten zie je na het ontgrendelen van je rapport."}
          </p>
          {computed.windows.length > 0 && (
            <p className="small" style={{ margin: "6px 0 0" }} aria-live="polite">
              {(() => {
                const states = computed.windows.map((c) => stateOf(c.window, c.rule));
                const scanned = states.filter((x) => x.done === x.total && x.total > 0).length;
                const retake = states.filter((x) => x.retake.length > 0).length;
                return `${computed.windows.length} ${computed.windows.length === 1 ? "raam" : "ramen"} · ${scanned} gescand${retake ? ` · ${retake} opnieuw scannen` : ""}`;
              })()}
            </p>
          )}
          {processing && (
            <p className="small muted" role="status" style={{ margin: "4px 0 0" }}>
              {processing}
            </p>
          )}
        </div>
        <div className="row">
          {doc && pageInfoOk(doc, page) && (
            <button
              type="button"
              className={`btn btn-sm ${placing ? "btn-primary" : ""}`}
              aria-pressed={placing}
              onClick={() => setPlacing((x) => !x)}
            >
              {placing ? "Klaar met aanwijzen" : "Ramen aanwijzen op plattegrond"}
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => setTransfer(true)}>
            Scannen met je telefoon
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => update((p) => ({ ...p, windows: [...p.windows, newWindow(p.windows)] }))}
          >
            + Raam toevoegen
          </button>
        </div>
      </div>

      {back && (
        <div className="notice stack-sm" role="region" aria-label="Terugsturen naar je computer">
          <span className="small">Dit project kwam van je computer. Klaar met scannen? Stuur je ramen terug; ze gaan versleuteld mee.</span>
          <div className="row">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                setBackStatus("Versturen…");
                sendBack(back, project).then(
                  () => setBackStatus("Verstuurd. Je computer haalt je scans op zolang het venster daar open staat."),
                  (err: Error) => setBackStatus(err.message),
                );
              }}
            >
              Terugsturen naar je computer
            </button>
            {backStatus && (
              <span className="small" role="status">
                {backStatus}
              </span>
            )}
          </div>
        </div>
      )}

      {placing && doc && (
        <p className="small" style={{ margin: 0 }} aria-live="polite">
          {moving
            ? `Klik op de nieuwe plek voor ${project.windows.find((w) => w.id === moving)?.code ?? "het raam"}.`
            : "Klik op de plattegrond om een raam toe te voegen, of klik op een raamcode om dat raam te verplaatsen."}
        </p>
      )}
      {placing && doc && (
        <PlanCanvas
          page={doc.pages[page]!}
          imageUrl={image.url}
          status={image.missing ? "Het bestand staat niet meer op dit apparaat." : image.error}
          tool="window"
          rooms={[]}
          windows={project.windows
            .filter((w) => w.page === page && w.position)
            .map((w) => ({ id: w.id, code: w.code, position: w.position!, active: w.id === moving }))}
          draft={[]}
          line={null}
          labels={[]}
          onWindowClick={(wid) => setMoving((m) => (m === wid ? null : wid))}
          onPoint={(pt) => {
            if (moving) {
              update((p) => ({ ...p, windows: p.windows.map((w) => (w.id === moving ? { ...w, page, position: pt } : w)) }));
              setMoving(null);
            } else update((p) => ({ ...p, windows: [...p.windows, newWindow(p.windows, { page, position: pt })] }));
          }}
          onRoomClick={() => undefined}
          onCancel={() => setPlacing(false)}
          onUndo={() => undefined}
        />
      )}

      {computed.windows.length === 0 && <p className="notice">Nog geen ramen. Voeg ze toe of wijs ze aan op de plattegrond.</p>}

      <div className="stack-sm">
        {computed.windows.map(({ window: w, rule, evaluation, order }) => {
          const rules = rulesFor(w.product, w.mounting);
          const raw = [...rule.required, ...rule.optional].filter((k) => w.measures[k]);
          const scan = stateOf(w, rule);
          return (
            <article key={w.id} className="window-card" aria-labelledby={`${id}-${w.id}`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="code badge badge-brand" id={`${id}-${w.id}`}>
                    {w.code}
                  </span>
                  <input
                    className="input"
                    style={{ minHeight: 36, padding: "4px 10px", maxWidth: 220 }}
                    aria-label={`Omschrijving van raam ${w.code}`}
                    placeholder="Omschrijving, bijv. raam links"
                    value={w.label}
                    maxLength={60}
                    onChange={(e) => setWindow({ ...w, label: e.target.value })}
                  />
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <StatusBadge status={scan.status} label={`ScanTag: ${scan.label}`} />
                  {paid && <StatusBadge status={STATUS_FOR[evaluation.status]} label={WINDOW_STATUS_LABELS[evaluation.status]} />}
                </div>
              </div>
              <div className="room-fields" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", marginTop: 0 }}>
                <div className="field">
                  <label htmlFor={`${id}-${w.id}-room`}>Ruimte</label>
                  <select
                    id={`${id}-${w.id}-room`}
                    className="select"
                    value={w.roomId ?? ""}
                    onChange={(e) => setWindow({ ...w, roomId: e.target.value || null })}
                  >
                    <option value="">Niet gekoppeld</option>
                    {project.rooms.map((r, i) => (
                      <option key={r.id} value={r.id}>
                        {i + 1}. {r.name.trim() || "Naamloze ruimte"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${id}-${w.id}-product`}>Product</label>
                  <select
                    id={`${id}-${w.id}-product`}
                    className="select"
                    value={w.product}
                    onChange={(e) => {
                      const product = e.target.value as ProductFamily;
                      const m = mountingsFor(product);
                      setProduct(w, product, m.includes(w.mounting) ? w.mounting : m[0]!);
                    }}
                  >
                    {PRODUCT_FAMILIES.map((f) => (
                      <option key={f} value={f}>
                        {PRODUCT_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${id}-${w.id}-mount`}>Montage</label>
                  <select
                    id={`${id}-${w.id}-mount`}
                    className="select"
                    value={w.mounting}
                    onChange={(e) => setProduct(w, w.product, e.target.value as Mounting)}
                  >
                    {mountingsFor(w.product).map((m) => (
                      <option key={m} value={m}>
                        {MOUNTING_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${id}-${w.id}-rule`}>Meetregel</label>
                  <select
                    id={`${id}-${w.id}-rule`}
                    className="select"
                    value={rule.id}
                    onChange={(e) => {
                      const next = findRule(e.target.value) ?? rule;
                      setWindow(applyScanToWindow({ ...w, ruleId: next.id, confirmed: false }, next));
                    }}
                  >
                    {rules.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.kind === "supplier" ? r.title : "Algemeen meetblad (geen leveranciersregel)"}
                        {productRule(r.id)?.source.status === "concept" ? " — concept" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${id}-${w.id}-shape`}>Raamvorm</label>
                  <select
                    id={`${id}-${w.id}-shape`}
                    className="select"
                    value={w.shape}
                    onChange={(e) => setWindow({ ...w, shape: e.target.value as ProjectWindow["shape"], confirmed: false })}
                  >
                    {Object.entries(SHAPES).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {w.shape !== "rechthoek" && (
                <p className="notice notice-warn small" style={{ margin: 0 }}>
                  {w.shape === "erker"
                    ? "Een erker is geen rechthoekig raam: per product gelden aparte meetinstructies. ScanTag en de meetregels rekenen er niet mee; vraag je leverancier om de instructie voor erkers."
                    : "ScanTag en de meetregels rekenen alleen met rechthoekige ramen. Voor deze vorm geeft je leverancier een eigen meetinstructie."}
                </p>
              )}
              {paid && (w.origin === "auto" || w.planWidthMm) && (
                <p className="small" style={{ margin: 0 }}>
                  {w.origin === "auto" ? "Herkend op de tekening. " : ""}
                  {w.planWidthMm
                    ? `Opening op de tekening ongeveer ${formatMm(w.planWidthMm)} breed: een indicatie om het juiste raam te vinden, geen raammaat.`
                    : ""}
                </p>
              )}
              {!paid && w.origin === "auto" && (
                <p className="small" style={{ margin: 0 }}>
                  Herkend op de tekening.
                </p>
              )}
              {scan.retake.length > 0 && w.scanVerdicts && (
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {[
                    ...new Set(Object.values(w.scanVerdicts.targets).flatMap((v) => (v?.status === "retake_required" ? v.reasons : []))),
                  ].map((r) => (
                    <li key={r}>{SCAN_REASONS[r]}</li>
                  ))}
                </ul>
              )}
              {paid && evaluation.scan && (
                <p className="small" style={{ margin: 0 }}>
                  Met ScanTag gemeten: {evaluation.scan.keys.length} {evaluation.scan.keys.length === 1 ? "maat" : "maten"}, foutmarge tot ±{" "}
                  {formatMm(shownMarginMm(evaluation.scan.maxUncertaintyMm))}.
                </p>
              )}
              {paid && (
                <p className="small muted num" style={{ margin: 0 }}>
                  {raw.length
                    ? raw
                        .map((k) => `${formatMm(w.measures[k]!)}${w.sources[k] ? ` ±${shownMarginMm(w.sources[k]!.uncertaintyMm)}` : ""}`)
                        .join(" · ")
                    : "Nog geen maten."}{" "}
                  {evaluation.missing.length > 0 && raw.length > 0
                    ? `Nog nodig: ${evaluation.missing.map((k) => MEASURE_INFO[k].label.toLowerCase()).join(", ")}. `
                    : ""}
                </p>
              )}
              {paid && (
                <p className="small" style={{ margin: 0 }}>
                  <StatusBadge status={ORDER_STATUS_FOR[order.status]} label={ORDER_STATUS_LABELS[order.status]} />{" "}
                  {order.order
                    ? orderSummary(order).split(": ").slice(1).join(": ")
                    : order.status === "measuring_sheet"
                      ? "Bestelmaat: volgens je leverancier."
                      : ""}
                </p>
              )}
              <div className="row">
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setScanFor(w.id)}>
                  {w.scans.length ? "ScanTag bekijken" : "Scannen met ScanTag"}
                </button>
                {paid && (
                  <button type="button" className="btn btn-sm" onClick={() => setOpen({ id: w.id, resume: false })}>
                    {raw.length ? "Maten nakijken en bevestigen" : "Zelf invullen"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => update((p) => ({ ...p, windows: p.windows.filter((x) => x.id !== w.id) }))}
                >
                  Verwijderen
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {transfer && <TransferDialog project={project} update={update} onClose={() => setTransfer(false)} />}
      {opened && paid && (
        <MeasureWizard
          window={opened.window}
          rule={opened.rule}
          product={productRule(opened.rule.id)!}
          order={opened.order}
          resume={open?.resume ?? false}
          onChange={setWindow}
          onClose={() => setOpen(null)}
        />
      )}
      {scanning && (
        <ArScan
          heading={`${scanning.window.code}${scanning.window.label ? ` · ${scanning.window.label}` : ""} · ${scanning.rule.title}`}
          tasks={tasksFor(scanning.rule)}
          shots={scanning.window.scans}
          verdicts={
            verdictsCurrent(scanning.window.scans, scanning.window.scanVerdicts, {
              product: scanning.window.product,
              mounting: scanning.window.mounting,
              shape: scanning.window.shape,
            })
              ? scanning.window.scanVerdicts!.targets
              : null
          }
          reveal={paid}
          onSave={(shots) => saveShots(scanning.window.id, shots)}
          onOtherDevice={() => {
            setScanFor(null);
            setTransfer(true);
          }}
          onClose={() => {
            setScanFor(null);
            // Measured: on to the remaining measurements, the questions and the confirmation.
            if (paid && scanning.window.scans.length) setOpen({ id: scanning.window.id, resume: true });
          }}
        />
      )}
    </section>
  );
}

function pageInfoOk(doc: NonNullable<StepProps["project"]["document"]>, page: number) {
  return Boolean(doc.pages[page]);
}
