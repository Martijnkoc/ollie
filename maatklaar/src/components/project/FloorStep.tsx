"use client";

import { useId } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { PRICE } from "@/config/site";
import { formatCount, formatM2, formatPercent, parseDecimal } from "@/lib/format";
import { PATTERNS, patternByKey } from "@/lib/materials/patterns";
import { isPaid, type StepProps } from "./types";

export function FloorStep({ project, update, computed, goTo }: StepProps) {
  const id = useId();
  const f = computed.floor;
  const pattern = patternByKey(project.floor.pattern);
  const bagArea = project.building?.verblijfsobject?.oppervlakteM2 ?? null;
  const paid = isPaid(project);

  return (
    <section className="stack" aria-labelledby="stap-vloer">
      <div className="panel stack">
        <div className="panel-head">
          <div>
            <h2 id="stap-vloer" tabIndex={-1}>
              Je vloer per kamer
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              Vink aan welke ruimtes meetellen. Het totaal verandert direct. Gratis, zonder account.
            </p>
          </div>
          <div className="room-meta">
            {computed.verified ? (
              <StatusBadge status="derived" label="Gecontroleerd: alles uit bevestigde maten" />
            ) : (
              <StatusBadge status={f.status} />
            )}
          </div>
        </div>

        {project.rooms.length === 0 ? (
          <div className="notice">
            Er zijn nog geen ruimtes.{" "}
            <button type="button" className="btn btn-sm" onClick={() => goTo("kamers")}>
              Ruimtes toevoegen
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <caption className="visually-hidden">Vloeroppervlakte per ruimte</caption>
              <thead>
                <tr>
                  <th scope="col">Meetellen</th>
                  <th scope="col">Ruimte</th>
                  <th scope="col" className="num">
                    Netto
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {computed.rooms.map((r, i) => (
                  <tr key={r.room.id} className={r.room.includeFloor ? undefined : "off"}>
                    <td>
                      <input
                        type="checkbox"
                        id={`${id}-${r.room.id}`}
                        checked={r.room.includeFloor}
                        style={{ width: 22, height: 22, accentColor: "var(--brand)" }}
                        onChange={(e) =>
                          update((p) => ({
                            ...p,
                            rooms: p.rooms.map((x) => (x.id === r.room.id ? { ...x, includeFloor: e.target.checked } : x)),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <label htmlFor={`${id}-${r.room.id}`}>
                        <span className="muted">{i + 1}.</span> {r.room.name.trim() || "Naamloze ruimte"}
                      </label>
                    </td>
                    <td className="num">{r.netAreaMm2 !== null ? formatM2(r.netAreaMm2 / 1_000_000) : "—"}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid-2">
          <div className="field">
            <label htmlFor={`${id}-pattern`}>Legpatroon</label>
            <select
              id={`${id}-pattern`}
              className="select"
              value={pattern.key}
              onChange={(e) => {
                const next = patternByKey(e.target.value);
                update((p) => ({
                  ...p,
                  floor: { ...p.floor, pattern: next.key, wastePercent: next.guidePercent ?? p.floor.wastePercent },
                }));
              }}
            >
              {PATTERNS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                  {p.guidePercent !== null ? ` — richtwaarde ${p.guidePercent}%` : ""}
                </option>
              ))}
            </select>
            <span className="hint">
              Richtwaarden zijn een startpunt. Kijk in de leginstructie van jouw vloer en pas het percentage aan.
            </span>
          </div>
          <div className="field">
            <label htmlFor={`${id}-waste`}>Snijverlies</label>
            <div className="input-unit" style={{ maxWidth: 200 }}>
              <input
                id={`${id}-waste`}
                className="input"
                inputMode="decimal"
                defaultValue={String(project.floor.wastePercent).replace(".", ",")}
                key={`w-${project.floor.wastePercent}`}
                onBlur={(e) => {
                  const v = parseDecimal(e.target.value);
                  if (v !== null && v <= 50)
                    update((p) => ({
                      ...p,
                      floor: {
                        ...p.floor,
                        wastePercent: v,
                        pattern: v === patternByKey(p.floor.pattern).guidePercent ? p.floor.pattern : "eigen",
                      },
                    }));
                }}
              />
              <span>%</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${id}-pack`}>Inhoud per pak (optioneel)</label>
            <div className="input-unit" style={{ maxWidth: 200 }}>
              <input
                id={`${id}-pack`}
                className="input"
                inputMode="decimal"
                placeholder="bijv. 2,131"
                defaultValue={project.floor.packM2 === null ? "" : String(project.floor.packM2).replace(".", ",")}
                key={`p-${project.floor.packM2}`}
                onBlur={(e) => {
                  const v = e.target.value.trim() ? parseDecimal(e.target.value) : null;
                  if (v === null || (v > 0 && v <= 100)) update((p) => ({ ...p, floor: { ...p.floor, packM2: v } }));
                }}
              />
              <span>m²</span>
            </div>
            <span className="hint">
              Staat op de verpakking of productpagina van jouw vloer. Zonder deze waarde rekenen we geen pakken uit.
            </span>
          </div>
        </div>

        <div className="result-hero" aria-live="polite">
          <div className="metric">
            <div className="small muted">Geselecteerd netto ({f.includedCount} ruimtes)</div>
            <div className="value">{formatM2(f.selectedNetM2)}</div>
            {f.incompleteRooms.length > 0 && <div className="small">Onvolledig: {f.incompleteRooms.join(", ")}</div>}
          </div>
          <div className="metric primary">
            <div className="small muted">Benodigd met {formatPercent(f.wastePercent)} snijverlies</div>
            <div className="value">{f.requiredM2 !== null ? formatM2(f.requiredM2) : "—"}</div>
          </div>
          <div className="metric">
            <div className="small muted">Pakken</div>
            <div className="value">{f.packs !== null ? formatCount(f.packs) : "—"}</div>
            {f.packs !== null && f.packM2 !== null && <div className="small muted">à {formatM2(f.packM2, 3)}, naar boven afgerond</div>}
          </div>
        </div>

        <details open>
          <summary style={{ cursor: "pointer", fontWeight: 650 }}>Zo rekenen we</summary>
          <ol className="steps-list" style={{ marginTop: 10 }}>
            {f.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </details>

        {bagArea !== null && (
          <p className="notice small">
            Ter vergelijking: de BAG registreert {formatM2(bagArea)} gebruiksoppervlakte voor de hele woning. Dat is een andere meting dan
            de vloer per kamer (muren, kasten, trapgaten en ruimtes die je niet meetelt maken het verschil). We tellen ze nooit bij elkaar
            op of door elkaar.
          </p>
        )}
      </div>

      {!paid && f.includedCount > 0 && (
        <aside className="upsell" aria-labelledby="upsell-titel">
          <div>
            <h2 id="upsell-titel" style={{ color: "inherit" }}>
              Wil je ook plinten en raamdecoratie in één bestellijst?
            </h2>
            <p style={{ opacity: 0.9 }}>Ontvang je complete meetrapport voor {PRICE.label} eenmalig.</p>
            <ul className="ticks">
              <li>Plinten per ruimte en per wand, met deuren en marge</li>
              <li>Raamregister met begeleid meetprotocol per raam</li>
              <li>PDF-rapport en CSV-bestellijst</li>
            </ul>
          </div>
          <div className="stack-sm">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => goTo("plinten-ramen")}>
              Bekijk wat je krijgt
            </button>
            <span className="small" style={{ opacity: 0.85 }}>
              Eenmalig, geen abonnement. Je gratis vloerresultaat blijft gewoon zichtbaar.
            </span>
          </div>
        </aside>
      )}
    </section>
  );
}
