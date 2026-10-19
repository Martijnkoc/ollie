"use client";

import { useId, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMFromMm, formatMm } from "@/lib/format";
import { WINDOW_STATUS_LABELS, type WindowStatus } from "@/lib/measurements/evaluate";
import { rulesFor } from "@/lib/measurements/protocols";
import {
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
import { MeasureWizard } from "./MeasureWizard";
import { PhotoAssistant } from "./PhotoAssistant";
import { compareWithPhoto } from "@/lib/measurements/photo";
import { PlanCanvas } from "./PlanCanvas";
import { usePlanImage } from "./usePlanImage";
import type { StepProps } from "./types";

const STATUS_FOR: Record<WindowStatus, Status> = {
  "nog-meten": "missing",
  afwijking: "check",
  ingevoerd: "auto",
  bevestigd: "confirmed",
  bestelmaat: "derived",
};

export function WindowSection({ project, update, computed }: StepProps) {
  const id = useId();
  const [open, setOpen] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const doc = project.document;
  const page = doc ? Math.min(doc.selectedPage, doc.pages.length - 1) : 0;
  const image = usePlanImage(project.id, doc, page, doc ? doc.sizeBytes : 0);

  const setWindow = (w: ProjectWindow) => update((p) => ({ ...p, windows: p.windows.map((x) => (x.id === w.id ? w : x)) }));
  const setProduct = (w: ProjectWindow, product: ProductFamily, mounting: Mounting) =>
    setWindow({ ...w, product, mounting, ruleId: defaultRuleFor(product, mounting).id, confirmed: false });
  const opened = computed.windows.find((x) => x.window.id === open);

  return (
    <section className="panel stack" aria-labelledby={`${id}-title`}>
      <div className="panel-head">
        <div>
          <h2 id={`${id}-title`} tabIndex={-1}>
            Raamregister
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Elk raam krijgt een code. Een plattegrond van bovenaf vertelt niet hoe groot een raam echt is: die maten meet je zelf, wij
            begeleiden je per raam.
          </p>
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
        {computed.windows.map(({ window: w, rule, evaluation }) => {
          const rules = rulesFor(w.product, w.mounting);
          const raw = [...rule.required, ...rule.optional].filter((k) => w.measures[k]);
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
                <StatusBadge status={STATUS_FOR[evaluation.status]} label={WINDOW_STATUS_LABELS[evaluation.status]} />
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
                    onChange={(e) => setWindow({ ...w, ruleId: e.target.value, confirmed: false })}
                  >
                    {rules.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.kind === "supplier" ? `${r.manufacturer} — ${r.title}` : "Algemeen meetblad (geen leveranciersregel)"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {(w.origin === "auto" || w.planWidthMm) && (
                <p className="small" style={{ margin: 0 }}>
                  {w.origin === "auto" ? "Herkend op de tekening. " : ""}
                  {w.planWidthMm
                    ? `Opening op de tekening ongeveer ${formatMFromMm(w.planWidthMm)} breed: een indicatie om het juiste raam te vinden, geen raammaat.`
                    : ""}
                </p>
              )}
              {w.photo?.estimate && (
                <p className="small" style={{ margin: 0 }}>
                  Foto-schatting (niet bevestigd): ca. {formatMm(Math.round(Math.max(w.photo.estimate.topMm, w.photo.estimate.bottomMm)))} ×{" "}
                  {formatMm(Math.round(Math.max(w.photo.estimate.leftMm, w.photo.estimate.rightMm)))}, ±{" "}
                  {formatMm(w.photo.estimate.uncertaintyMm)}. {photoCheck(w)}
                </p>
              )}
              <p className="small muted" style={{ margin: 0 }}>
                {raw.length ? raw.map((k) => formatMm(w.measures[k]!)).join(" · ") : "Nog geen maten."}{" "}
                {evaluation.order
                  ? `Bestelmaat ${formatMm(evaluation.order.widthMm)} × ${formatMm(evaluation.order.heightMm)}.`
                  : "Bestelmaat: volgens je leverancier."}
              </p>
              <div className="row">
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(w.id)}>
                  {raw.length ? "Maten bekijken of aanpassen" : "Meten"}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setPhotoFor(w.id)}>
                  {w.photo ? "Foto en schatting" : "Foto-assistent"}
                </button>
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

      {opened && <MeasureWizard window={opened.window} rule={opened.rule} onChange={setWindow} onClose={() => setOpen(null)} />}
      {photoFor && project.windows.some((x) => x.id === photoFor) && (
        <PhotoAssistant
          projectId={project.id}
          window={project.windows.find((x) => x.id === photoFor)!}
          onChange={setWindow}
          onClose={() => setPhotoFor(null)}
        />
      )}
    </section>
  );
}

/** A tape measurement far from the photo estimate means one of the two needs another look. */
function photoCheck(w: ProjectWindow) {
  const e = w.photo?.estimate;
  if (!e) return "";
  const pairs: [number | undefined, number][] = [
    [w.measures.breedte_boven, e.topMm],
    [w.measures.breedte_onder, e.bottomMm],
    [w.measures.hoogte_links, e.leftMm],
    [w.measures.hoogte_rechts, e.rightMm],
  ];
  const compared = pairs
    .filter((p): p is [number, number] => typeof p[0] === "number")
    .map(([m, est]) => compareWithPhoto(m, est, e.uncertaintyMm));
  if (!compared.length) return "Meet het raam met een rolmaat; daarna vergelijken we.";
  const off = compared.filter((c) => !c.agrees);
  return off.length
    ? `Je meting wijkt tot ${formatMm(Math.max(...off.map((c) => c.gapMm)))} af van de foto: meet die maat nog eens na.`
    : "Je metingen passen bij de foto.";
}

function pageInfoOk(doc: NonNullable<StepProps["project"]["document"]>, page: number) {
  return Boolean(doc.pages[page]);
}
