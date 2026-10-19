"use client";

import { useEffect, useId, useRef, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMFromMm, formatMm } from "@/lib/format";
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
import { applyCameraToWindow, tasksFor, type CameraShot } from "@/lib/measurements/camera";
import { findRule } from "@/lib/measurements/protocols";
import { withAudit } from "@/lib/projects/audit";
import { productRule } from "@/lib/rules";
import { ORDER_STATUS_LABELS, orderSummary, type OrderStatus } from "@/lib/rules/engine";
import { scanStatus } from "@/lib/scantag/status";
import { CameraMeasure } from "./CameraMeasure";
import { mergeResults, processShots } from "./scantag-client";
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
  concept: "check",
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
  const [cameraFor, setCameraFor] = useState<string | null>(null);
  const doc = project.document;
  const page = doc ? Math.min(doc.selectedPage, doc.pages.length - 1) : 0;
  const image = usePlanImage(project.id, doc, page, doc ? doc.sizeBytes : 0);

  // Every change to a window goes through the audit log.
  const setWindow = (w: ProjectWindow) => update((p) => ({ ...p, windows: p.windows.map((x) => (x.id === w.id ? withAudit(x, w) : x)) }));
  const saveShots = (windowId: string, shots: CameraShot[]) =>
    update((p) => ({
      ...p,
      windows: p.windows.map((x) => {
        if (x.id !== windowId) return x;
        const rule = computed.windows.find((c) => c.window.id === windowId)?.rule;
        const next = { ...x, camera: shots };
        return withAudit(x, rule ? applyCameraToWindow(next, rule) : next);
      }),
    }));
  const process = (shots: CameraShot[]) => processShots(project, shots).then((r) => mergeResults(shots, r.released, r.results));

  // After payment: send scans that have no sizes yet, so the server releases them. Once per set of shots.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!paid) return;
    for (const w of project.windows) {
      const waiting = w.camera.filter((s) => !s.processed || (s.quality.status === "ok" && !Object.keys(s.values).length));
      const key = waiting.map((s) => s.id).join(",");
      if (!waiting.length || asked.current.has(key)) continue;
      asked.current.add(key);
      void process(waiting)
        .then((done) =>
          saveShots(
            w.id,
            w.camera.map((s) => done.find((d) => d.id === s.id) ?? s),
          ),
        )
        .catch(() => asked.current.delete(key));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid, project.windows]);
  // A new rule may ask for other measurements: camera values follow it, typed values stay.
  const setProduct = (w: ProjectWindow, product: ProductFamily, mounting: Mounting) => {
    const rule = defaultRuleFor(product, mounting);
    setWindow(applyCameraToWindow({ ...w, product, mounting, ruleId: rule.id, confirmed: false }, rule));
  };
  const opened = computed.windows.find((x) => x.window.id === open?.id);
  const camera = computed.windows.find((x) => x.window.id === cameraFor);

  return (
    <section className="panel stack" aria-labelledby={`${id}-title`}>
      <div className="panel-head">
        <div>
          <h2 id={`${id}-title`} tabIndex={-1}>
            {paid ? "Raamregister" : "ScanTag: scan je ramen alvast"}
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            {paid
              ? "Elk raam krijgt een code. Een plattegrond van bovenaf vertelt niet hoe groot een raam echt is: die meet je met ScanTag (je camera en twee A4-vellen) of zelf met een rolmaat. Elke maat houdt zijn bron, foutmarge en validatiestatus."
              : "Scan je ramen met je telefoon: twee A4-vellen op de muur, een foto, de hoeken aantikken. We controleren elke scan. De maten en bestelmaten zie je na het ontgrendelen van je rapport."}
          </p>
          {!paid && computed.windows.length > 0 && (
            <p className="small" style={{ margin: "6px 0 0" }} aria-live="polite">
              {computed.windows.length} {computed.windows.length === 1 ? "raam" : "ramen"} ·{" "}
              {computed.windows.filter((c) => scanStatus(c.window.camera, tasksFor(c.rule)).label === "Scan verwerkt").length} gescand
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
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => update((p) => ({ ...p, windows: [...p.windows, newWindow(p.windows)] }))}
          >
            + Raam toevoegen
          </button>
        </div>
      </div>

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
          const scan = scanStatus(w.camera, tasksFor(rule));
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
                      setWindow(applyCameraToWindow({ ...w, ruleId: next.id, confirmed: false }, next));
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
                    ? `Opening op de tekening ongeveer ${formatMFromMm(w.planWidthMm)} breed: een indicatie om het juiste raam te vinden, geen raammaat.`
                    : ""}
                </p>
              )}
              {!paid && w.origin === "auto" && (
                <p className="small" style={{ margin: 0 }}>
                  Herkend op de tekening.
                </p>
              )}
              {paid && evaluation.camera && (
                <p className="small" style={{ margin: 0 }}>
                  Met ScanTag gemeten: {evaluation.camera.keys.length} {evaluation.camera.keys.length === 1 ? "maat" : "maten"}, foutmarge
                  tot ± {formatMm(evaluation.camera.maxUncertaintyMm)}, niet gevalideerd.
                </p>
              )}
              {paid && (
                <p className="small muted" style={{ margin: 0 }}>
                  {raw.length
                    ? raw.map((k) => `${formatMm(w.measures[k]!)}${w.sources[k] ? ` ±${w.sources[k]!.uncertaintyMm}` : ""}`).join(" · ")
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
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setCameraFor(w.id)}>
                  {w.camera.length ? "ScanTag bekijken" : "Scannen met ScanTag"}
                </button>
                {paid && (
                  <button type="button" className="btn btn-sm" onClick={() => setOpen({ id: w.id, resume: false })}>
                    {raw.length ? "Maten nakijken en bevestigen" : "Zelf invullen (rolmaat)"}
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
      {camera && (
        <CameraMeasure
          projectId={project.id}
          owner={camera.window.id}
          heading={`${camera.window.code}${camera.window.label ? ` · ${camera.window.label}` : ""} · ${camera.rule.title}`}
          tasks={tasksFor(camera.rule)}
          shots={camera.window.camera}
          reveal={paid}
          process={process}
          onSave={(shots) => saveShots(camera.window.id, shots)}
          onClose={() => {
            setCameraFor(null);
            // Measured: on to the remaining measurements, the questions and the confirmation.
            if (paid && camera.window.camera.length) setOpen({ id: camera.window.id, resume: true });
          }}
        />
      )}
    </section>
  );
}

function pageInfoOk(doc: NonNullable<StepProps["project"]["document"]>, page: number) {
  return Boolean(doc.pages[page]);
}
