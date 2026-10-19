"use client";

import { useId, useState } from "react";
import { formatCount, formatMm, parseDecimal } from "@/lib/format";
import { CAMERA_TASKS, cameraResults, ceilingHeightM } from "@/lib/measurements/camera";
import {
  CATALOG,
  CATEGORY_STATUS_LABELS,
  computeCategory,
  defaultRoomsFor,
  type CategoryKey,
  type CategoryModule,
  type CategoryStatus,
} from "@/lib/materials/catalog";
import type { ProjectComputation } from "@/lib/projects/compute";
import type { Project } from "@/lib/projects/schema";
import { CameraMeasure } from "./CameraMeasure";
import { processLocally } from "./scantag-client";

const STATUS_STYLE: Record<CategoryStatus, { icon: string; data: string }> = {
  niet_genoeg_gegevens: { icon: "?", data: "missing" },
  geschat: { icon: "≈", data: "check" },
  berekend: { icon: "=", data: "derived" },
  klaar_voor_bestellen: { icon: "✓", data: "confirmed" },
  wacht_op_controle: { icon: "…", data: "auto" },
  extra_controle_nodig: { icon: "!", data: "check" },
};

/** Category status with icon and text, never colour alone. */
export function CategoryStatusBadge({ status }: { status: CategoryStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className="badge" data-status={s.data}>
      <span className="badge-icon" aria-hidden="true">
        <span>{s.icon}</span>
      </span>
      {CATEGORY_STATUS_LABELS[status]}
    </span>
  );
}

const quantity = (q: number | null, unit: string) => {
  if (q === null) return "—";
  const whole = ["pakken", "stuks", "stuk", "dozen", "rollen"].includes(unit);
  return `${whole ? formatCount(q) : q.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ${unit}`;
};

/** Number of door openings found on the plan (all pages), as a hint for transition profiles. */
export const doorsOnPlan = (project: Project) => project.analyses.reduce((s, a) => s + (a.auto?.doors ?? 0), 0);

/**
 * One material category: the values it needs (assumptions shown as such), which rooms it covers, and the
 * result with its formula. Entering a value replaces the assumption and recalculates immediately.
 */
export function CategoryCard({
  module,
  project,
  update,
  computed,
}: {
  module: CategoryModule;
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  computed: ProjectComputation;
}) {
  const id = useId();
  const key: CategoryKey = module.key;
  const values = project.materials.inputs[key] ?? {};
  const chosen = project.materials.rooms[key] ?? null;
  const roomIds = chosen ?? defaultRoomsFor(module, project.rooms);
  const result = computeCategory(module, computed, { roomIds: chosen, inputs: values, doorsOnPlan: doorsOnPlan(project) });

  const setValue = (k: string, v: number | null) =>
    update((p) => ({
      ...p,
      materials: { ...p.materials, inputs: { ...p.materials.inputs, [key]: { ...(p.materials.inputs[key] ?? {}), [k]: v } } },
    }));
  const [measuring, setMeasuring] = useState(false);
  const ceiling = cameraResults(project.camera).find((r) => r.target === "plafondhoogte" && r.usable) ?? null;
  // One ceiling height for the home: a camera measurement fills it in for every material that uses it.
  const saveCeiling = (shots: Project["camera"]) =>
    update((p) => {
      const camera = [...p.camera.filter((s) => s.task !== "plafond"), ...shots];
      const result = cameraResults(camera).find((r) => r.target === "plafondhoogte" && r.usable);
      if (!result) return { ...p, camera };
      const inputs = { ...p.materials.inputs };
      for (const m of CATALOG)
        if (m.inputs.some((i) => i.key === "plafondhoogte"))
          inputs[m.key] = { ...(inputs[m.key] ?? {}), plafondhoogte: ceilingHeightM(result.mm) };
      return { ...p, camera, materials: { ...p.materials, inputs } };
    });
  const toggleRoom = (roomId: string, on: boolean) =>
    update((p) => {
      const current = p.materials.rooms[key] ?? defaultRoomsFor(module, p.rooms);
      const next = on ? [...new Set([...current, roomId])] : current.filter((x) => x !== roomId);
      return { ...p, materials: { ...p.materials, rooms: { ...p.materials.rooms, [key]: next } } };
    });

  return (
    <article className="card-flat stack-sm category-card" aria-labelledby={`${id}-t`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 id={`${id}-t`} style={{ margin: 0 }}>
          {module.label}
        </h3>
        <CategoryStatusBadge status={result.status} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {module.description}
      </p>

      {module.inputs.length > 0 && (
        <div className="room-fields" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: 0 }}>
          {module.inputs.map((input) => {
            const own = values[input.key];
            return (
              <div className="field" key={input.key}>
                <label htmlFor={`${id}-${input.key}`}>{input.label}</label>
                <div className="input-unit">
                  <input
                    id={`${id}-${input.key}`}
                    className="input"
                    inputMode="decimal"
                    placeholder={input.assumption ? `${String(input.assumption.value).replace(".", ",")} (aanname)` : ""}
                    defaultValue={typeof own === "number" ? String(own).replace(".", ",") : ""}
                    key={`${input.key}-${own ?? "x"}`}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const v = raw ? parseDecimal(raw) : null;
                      if (v === null) return setValue(input.key, null);
                      if (v >= input.min && v <= input.max) setValue(input.key, v);
                    }}
                  />
                  <span>{input.unit}</span>
                </div>
                {input.key === "plafondhoogte" && (
                  <button type="button" className="btn btn-sm" style={{ justifySelf: "start" }} onClick={() => setMeasuring(true)}>
                    {ceiling ? "Camerameting bekijken" : "Meten met camera"}
                  </button>
                )}
                <span className="hint">
                  {input.key === "plafondhoogte" && ceiling && own === ceilingHeightM(ceiling.mm)
                    ? `Met de camera gemeten: ± ${formatMm(ceiling.uncertaintyMm)} (${ceiling.shots} foto${ceiling.shots > 1 ? "'s" : ""}).`
                    : typeof own === "number"
                      ? input.help
                      : input.assumption
                        ? `Nu een aanname: ${input.assumption.why}.`
                        : input.required
                          ? `Nodig voor de berekening. ${input.help}`
                          : input.help}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {module.scope !== "raam" && project.rooms.length > 0 && (
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 650 }}>
            Ruimtes voor {module.label.toLowerCase()}
          </legend>
          <div className="row" style={{ gap: "6px 14px" }}>
            {project.rooms.map((r) => (
              <label key={r.id} className="row small" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  checked={roomIds.includes(r.id)}
                  onChange={(e) => toggleRoom(r.id, e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: "var(--brand)" }}
                />
                {r.name.trim() || "Naamloze ruimte"}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <table className="data">
        <caption className="visually-hidden">Resultaat {module.label}</caption>
        <tbody>
          {result.lines.map((l) => (
            <tr key={l.label}>
              <th scope="row" style={{ fontWeight: 500 }}>
                {l.label}
                {l.note && <div className="tiny muted">{l.note}</div>}
              </th>
              <td className="num">{quantity(l.quantity, l.unit)}</td>
            </tr>
          ))}
          {result.lines.length === 0 && (
            <tr>
              <td className="small muted">Nog niets te berekenen.</td>
            </tr>
          )}
        </tbody>
      </table>

      {(result.missing.length > 0 || result.assumptions.length > 0) && (
        <ul className="small" style={{ margin: 0 }}>
          {result.missing.map((m) => (
            <li key={m}>Ontbreekt: {m}</li>
          ))}
          {result.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <details>
        <summary className="small" style={{ cursor: "pointer", fontWeight: 650 }}>
          Zo rekenen we (regel {module.version}, {module.date})
        </summary>
        <p className="small" style={{ margin: "6px 0" }}>
          {module.formula}
        </p>
        {result.steps.length > 0 && (
          <ol className="steps-list small">
            {result.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
      </details>
      {measuring && (
        <CameraMeasure
          projectId={project.id}
          owner="woning"
          heading="Plafondhoogte voor verf en behang"
          tasks={[CAMERA_TASKS.plafond]}
          shots={project.camera.filter((s) => s.task === "plafond")}
          reveal
          process={processLocally}
          onSave={saveCeiling}
          onClose={() => setMeasuring(false)}
        />
      )}
    </article>
  );
}
