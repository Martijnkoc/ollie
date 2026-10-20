"use client";

import { useId } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCount, formatMFromMm, formatPercent, parseDecimal } from "@/lib/format";
import { centroid } from "@/lib/geometry/polygon";
import { randomId } from "@/lib/projects/factory";
import { MISSING, type Room } from "@/lib/projects/schema";
import { LengthInput } from "./LengthInput";
import type { StepProps } from "./types";

const wallName = (i: number) => `Wand ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`;

/** Small outline of the room with wall letters, so "Wand B" can be found on the plan. */
function WallDiagram({ polygon }: { polygon: { x: number; y: number }[] }) {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX || 1;
  const h = Math.max(...ys) - minY || 1;
  const pad = Math.max(w, h) * 0.16;
  const c = centroid(polygon);
  const fs = Math.max(w, h) / 9;
  return (
    <svg viewBox={`${minX - pad} ${minY - pad} ${w + 2 * pad} ${h + 2 * pad}`} style={{ width: 120, height: 100 }} aria-hidden="true">
      <polygon
        points={polygon.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="rgba(255,106,53,0.12)"
        stroke="#191c1a"
        strokeWidth={Math.max(w, h) / 60}
      />
      {polygon.map((p, i) => {
        const q = polygon[(i + 1) % polygon.length]!;
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        // Push the letter slightly outward from the centre.
        const dx = mx - c.x;
        const dy = my - c.y;
        const d = Math.hypot(dx, dy) || 1;
        return (
          <text
            key={i}
            x={mx + (dx / d) * fs * 0.9}
            y={my + (dy / d) * fs * 0.9 + fs * 0.35}
            fontSize={fs}
            textAnchor="middle"
            fontWeight={700}
            fill="#191c1a"
          >
            {String.fromCharCode(65 + (i % 26))}
          </text>
        );
      })}
    </svg>
  );
}

export function PlinthSection({ project, update, computed }: StepProps) {
  const id = useId();
  const t = computed.plinths;
  const setRoom = (room: Room) => update((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === room.id ? room : r)) }));

  return (
    <section className="panel stack" aria-labelledby={`${id}-title`}>
      <div className="panel-head">
        <div>
          <h2 id={`${id}-title`} tabIndex={-1}>
            Plinten
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            We rekenen met de omtrek van elke gecontroleerde ruimte. Geef aan waar geen plint komt en welke deuropeningen eraf gaan.
          </p>
        </div>
        <StatusBadge status={t.status} />
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor={`${id}-margin`}>Extra marge</label>
          <div className="input-unit" style={{ maxWidth: 200 }}>
            <input
              id={`${id}-margin`}
              className="input"
              inputMode="decimal"
              defaultValue={String(project.plinth.marginPercent).replace(".", ",")}
              key={`m-${project.plinth.marginPercent}`}
              onBlur={(e) => {
                const v = parseDecimal(e.target.value);
                if (v !== null && v <= 50) update((p) => ({ ...p, plinth: { ...p.plinth, marginPercent: v } }));
              }}
            />
            <span>%</span>
          </div>
          <span className="hint">Voor zaagverlies en verstekhoeken. Een startwaarde; pas hem aan naar jouw situatie.</span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-piece`}>Lengte waarin jouw plint verkocht wordt (optioneel)</label>
          <div className="input-unit" style={{ maxWidth: 200 }}>
            <input
              id={`${id}-piece`}
              className="input"
              inputMode="numeric"
              placeholder="bijv. 2400"
              defaultValue={project.plinth.pieceLengthMm ?? ""}
              key={`l-${project.plinth.pieceLengthMm}`}
              onBlur={(e) => {
                const v = e.target.value.trim() ? Number(e.target.value.replace(/\s/g, "")) : null;
                if (v === null || (Number.isInteger(v) && v > 0 && v <= 10_000))
                  update((p) => ({ ...p, plinth: { ...p.plinth, pieceLengthMm: v } }));
              }}
            />
            <span>mm</span>
          </div>
          <span className="hint">Alleen invullen als je de handelslengte van jouw plint kent. We nemen geen standaardlengte aan.</span>
        </div>
      </div>

      <div className="stack">
        {computed.rooms.map((r, n) => {
          const room = r.room;
          const res = t.rooms.find((x) => x.id === room.id);
          const edges = r.geometry.edgesMm;
          return (
            <div key={room.id} className="room-card stack-sm">
              <div className="room-card-head">
                <label className="check" style={{ alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={room.includePlinth}
                    onChange={(e) => setRoom({ ...room, includePlinth: e.target.checked })}
                  />
                  <span style={{ fontWeight: 650 }}>
                    {n + 1}. {room.name.trim() || "Naamloze ruimte"}
                  </span>
                </label>
                {room.includePlinth && res ? (
                  <StatusBadge status={res.status} />
                ) : (
                  <span className="badge badge-neutral">Geen plinten</span>
                )}
              </div>
              {room.includePlinth && !edges && (
                <p className="small muted" style={{ margin: 0 }}>
                  {res?.issues[0] ?? "De vorm van deze ruimte is nog onbekend."}
                </p>
              )}
              {room.includePlinth && edges && r.geometry.polygonMm && (
                <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 16 }}>
                  <WallDiagram polygon={r.geometry.polygonMm} />
                  <div className="stack-sm" style={{ flex: 1 }}>
                    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                      <legend className="small" style={{ fontWeight: 600 }}>
                        Plint op deze wanden
                      </legend>
                      <div className="row" style={{ gap: 6 }}>
                        {edges.map((len, i) => (
                          <label
                            key={i}
                            className="check small"
                            style={{ alignItems: "center", gap: 6, padding: "4px 8px", border: "1px solid var(--line)", borderRadius: 8 }}
                          >
                            <input
                              type="checkbox"
                              checked={!room.wallsWithoutPlinth.includes(i)}
                              onChange={(e) =>
                                setRoom({
                                  ...room,
                                  wallsWithoutPlinth: e.target.checked
                                    ? room.wallsWithoutPlinth.filter((w) => w !== i)
                                    : [...room.wallsWithoutPlinth, i],
                                })
                              }
                            />
                            <span>
                              {wallName(i)} · {formatMFromMm(len)}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    {room.doors.map((d, i) => (
                      <div key={d.id} className="row" style={{ alignItems: "flex-end" }}>
                        <div className="field">
                          <label htmlFor={`${id}-${d.id}-wall`} className="small">
                            Deuropening {i + 1} in
                          </label>
                          <select
                            id={`${id}-${d.id}-wall`}
                            className="select"
                            style={{ width: "auto" }}
                            value={d.wall}
                            onChange={(e) =>
                              setRoom({
                                ...room,
                                doors: room.doors.map((x) => (x.id === d.id ? { ...x, wall: Number(e.target.value) } : x)),
                              })
                            }
                          >
                            {edges.map((_, w) => (
                              <option key={w} value={w}>
                                {wallName(w)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div style={{ width: 170 }}>
                          <LengthInput
                            label="Breedte"
                            unit="mm"
                            value={d.width}
                            onChange={(width) => setRoom({ ...room, doors: room.doors.map((x) => (x.id === d.id ? { ...x, width } : x)) })}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setRoom({ ...room, doors: room.doors.filter((x) => x.id !== d.id) })}
                        >
                          Verwijderen
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ justifySelf: "start" }}
                      onClick={() => setRoom({ ...room, doors: [...room.doors, { id: randomId(10), wall: 0, width: { ...MISSING } }] })}
                    >
                      + Deuropening
                    </button>
                    <p className="tiny muted" style={{ margin: 0 }}>
                      Een deuropening gaat er pas af als je de breedte hebt ingevuld. Meet de opening tussen de kozijnstijlen.
                    </p>
                  </div>
                </div>
              )}
              {room.includePlinth && edges && res?.issues.length ? (
                <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                  {res.issues.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="result-hero" aria-live="polite">
        <div className="metric">
          <div className="small muted">Netto strekkende meters</div>
          <div className="value">{formatMFromMm(t.netMm)}</div>
          {t.incompleteRooms.length > 0 && <div className="small">Onvolledig: {t.incompleteRooms.join(", ")}</div>}
        </div>
        <div className="metric primary">
          <div className="small muted">Met {formatPercent(t.marginPercent)} marge</div>
          <div className="value">{t.requiredMm !== null ? formatMFromMm(t.requiredMm) : "—"}</div>
        </div>
        <div className="metric">
          <div className="small muted">Stuks</div>
          <div className="value">{t.piecesByTotal !== null ? formatCount(t.piecesByTotal) : "—"}</div>
          {t.pieceLengthMm !== null && t.piecesByTotal !== null && <div className="small muted">van {formatMFromMm(t.pieceLengthMm)}</div>}
        </div>
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 650 }}>Zo rekenen we</summary>
        <ol className="steps-list" style={{ marginTop: 10 }}>
          {t.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}
