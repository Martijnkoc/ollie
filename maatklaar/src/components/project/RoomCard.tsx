"use client";

import { useId } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatM2, formatM2FromMm2, parseDecimal } from "@/lib/format";
import { emptyRect, randomId } from "@/lib/projects/factory";
import type { RoomResult } from "@/lib/projects/compute";
import { MISSING, type Length, type Room, type RoomShape } from "@/lib/projects/schema";
import { LengthInput } from "./LengthInput";

const SHAPE_LABELS: Record<RoomShape["kind"], string> = {
  rect: "Rechthoek (lengte × breedte)",
  l: "L-vorm",
  drawn: "Getekend op de plattegrond",
  area: "Alleen oppervlakte bekend",
};

const CORNERS = [
  { key: "nw", label: "linksboven" },
  { key: "ne", label: "rechtsboven" },
  { key: "sw", label: "linksonder" },
  { key: "se", label: "rechtsonder" },
] as const;

function confirmLength(l: Length): Length {
  return l.status === "auto" ? { ...l, status: "confirmed" } : l;
}

/** Marks everything the computer recognised in this room as checked by the user. Missing values stay missing. */
export function confirmRoom(room: Room): Room {
  const s = room.shape;
  let shape: RoomShape = s;
  if (s.kind === "rect") shape = { ...s, length: confirmLength(s.length), width: confirmLength(s.width) };
  if (s.kind === "l") shape = { ...s, length: confirmLength(s.length), width: confirmLength(s.width), notchLength: confirmLength(s.notchLength), notchWidth: confirmLength(s.notchWidth) };
  if (s.kind === "drawn" && s.points.length >= 3) shape = { ...s, status: "confirmed" };
  if (s.kind === "area" && s.m2 !== null) shape = { ...s, status: "confirmed" };
  return { ...room, nameStatus: "confirmed", shape, obstacles: room.obstacles.map((o) => ({ ...o, length: confirmLength(o.length), width: confirmLength(o.width) })) };
}

function shapeSummary(room: Room) {
  const s = room.shape;
  const m = (l: Length) => (l.mm === null ? "?" : (l.mm / 1000).toFixed(2).replace(".", ","));
  if (s.kind === "rect") return `Rechthoek ${m(s.length)} × ${m(s.width)} m`;
  if (s.kind === "l") return `L-vorm ${m(s.length)} × ${m(s.width)} m, uitsparing ${m(s.notchLength)} × ${m(s.notchWidth)} m`;
  if (s.kind === "drawn") return s.points.length >= 3 ? `Getekend, ${s.points.length} hoekpunten` : "Nog niet getekend";
  return s.m2 === null ? "Oppervlakte nog onbekend" : "Alleen oppervlakte bekend";
}

function switchShape(room: Room, kind: RoomShape["kind"], page: number): RoomShape {
  const s = room.shape;
  if (kind === s.kind) return s;
  if (kind === "rect") return s.kind === "l" ? { kind: "rect", length: s.length, width: s.width } : emptyRect();
  if (kind === "l") {
    const base = s.kind === "rect" ? s : { length: { ...MISSING }, width: { ...MISSING } };
    return { kind: "l", length: base.length, width: base.width, notchLength: { ...MISSING }, notchWidth: { ...MISSING }, corner: "ne" };
  }
  if (kind === "drawn") return { kind: "drawn", page: room.page ?? page, points: [], status: "confirmed" };
  return { kind: "area", m2: null, status: "missing", source: "gebruiker" };
}

export function RoomCard({
  number,
  result,
  active,
  page,
  hasPlan,
  onActivate,
  onChange,
  onDelete,
  onDraw,
  onConfirmed,
}: {
  number: number;
  result: RoomResult;
  active: boolean;
  page: number;
  hasPlan: boolean;
  onActivate: () => void;
  onChange: (room: Room) => void;
  onDelete: () => void;
  onDraw: () => void;
  /** Called after "Naam en maten kloppen", e.g. to open the next room that still needs checking. */
  onConfirmed?: () => void;
}) {
  const room = result.room;
  const id = useId();
  const s = room.shape;
  const hasAuto =
    room.nameStatus === "auto" ||
    (s.kind === "rect" && [s.length, s.width].some((l) => l.status === "auto")) ||
    (s.kind === "l" && [s.length, s.width, s.notchLength, s.notchWidth].some((l) => l.status === "auto")) ||
    (s.kind === "area" && s.status === "auto") ||
    room.obstacles.some((o) => o.length.status === "auto" || o.width.status === "auto");

  const set = (patch: Partial<Room>) => onChange({ ...room, ...patch });
  const setShape = (shape: RoomShape) => onChange({ ...room, shape });

  if (!active) {
    return (
      <article className="room-card" aria-labelledby={`${id}-name`}>
        <div className="room-card-head">
          <div className="row" style={{ gap: 10, flexWrap: "nowrap", minWidth: 0 }}>
            <span className="room-num" aria-hidden="true">
              {number}
            </span>
            <h3 id={`${id}-name`} style={{ margin: 0, fontSize: "1.05rem" }}>
              {room.name.trim() || "Naamloze ruimte"}
            </h3>
          </div>
          <div className="room-area">{result.netAreaMm2 !== null ? formatM2FromMm2(result.netAreaMm2) : "—"}</div>
        </div>
        <div className="room-meta" style={{ marginTop: 8 }}>
          <StatusBadge status={result.status} />
          <span className="small muted">{shapeSummary(room)}</span>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <label className="check small" style={{ alignItems: "center" }}>
            <input type="checkbox" checked={room.includeFloor} onChange={(e) => set({ includeFloor: e.target.checked })} />
            <span>Meenemen in vloer</span>
          </label>
          <button type="button" className="btn btn-sm" aria-expanded={false} onClick={onActivate}>
            {hasAuto || result.status === "missing" ? "Controleren" : "Bewerken"}
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="room-card" data-active={active} aria-labelledby={`${id}-name`}>
      <div className="room-card-head">
        <div className="row" style={{ gap: 10, flexWrap: "nowrap", minWidth: 0 }}>
          <span className="room-num" aria-hidden="true">
            {number}
          </span>
          <div style={{ minWidth: 0 }}>
            <label className="visually-hidden" htmlFor={`${id}-name`}>
              Naam van ruimte {number}
            </label>
            <input
              id={`${id}-name`}
              className="input"
              style={{ fontWeight: 650, minHeight: 38, padding: "6px 10px" }}
              value={room.name}
              maxLength={60}
              placeholder="Naam van de ruimte"
              onChange={(e) => set({ name: e.target.value.slice(0, 60), nameStatus: "confirmed" })}
            />
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="room-area">{result.netAreaMm2 !== null ? formatM2FromMm2(result.netAreaMm2) : "—"}</div>
        </div>
      </div>

      <div className="room-meta" style={{ marginTop: 8 }}>
        <StatusBadge status={result.status} />
        {room.nameStatus === "auto" ? <StatusBadge status="auto" label="Naam automatisch herkend" /> : null}
        {room.page !== null && hasPlan ? <span className="badge badge-neutral">Pagina {room.page + 1}</span> : null}
      </div>

      <div className="room-fields">
        <div className="field full">
          <label htmlFor={`${id}-shape`}>Vorm</label>
          <select id={`${id}-shape`} className="select" value={s.kind} onChange={(e) => setShape(switchShape(room, e.target.value as RoomShape["kind"], page))}>
            {(Object.keys(SHAPE_LABELS) as RoomShape["kind"][]).filter((k) => k !== "drawn" || hasPlan).map((k) => (
              <option key={k} value={k}>
                {SHAPE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        {s.kind === "rect" && (
          <>
            <LengthInput label="Lengte" value={s.length} onChange={(length) => setShape({ ...s, length })} />
            <LengthInput label="Breedte" value={s.width} onChange={(width) => setShape({ ...s, width })} />
          </>
        )}

        {s.kind === "l" && (
          <>
            <LengthInput label="Totale lengte" value={s.length} onChange={(length) => setShape({ ...s, length })} />
            <LengthInput label="Totale breedte" value={s.width} onChange={(width) => setShape({ ...s, width })} />
            <LengthInput label="Uitsparing lengte" value={s.notchLength} onChange={(notchLength) => setShape({ ...s, notchLength })} />
            <LengthInput label="Uitsparing breedte" value={s.notchWidth} onChange={(notchWidth) => setShape({ ...s, notchWidth })} />
            <div className="field full">
              <span className="label" id={`${id}-corner`}>
                Welke hoek ontbreekt?
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby={`${id}-corner`}>
                {CORNERS.map((c) => (
                  <label key={c.key}>
                    <input type="radio" name={`${id}-corner`} checked={s.corner === c.key} onChange={() => setShape({ ...s, corner: c.key })} />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {s.kind === "drawn" && (
          <div className="full stack-sm">
            <p className="small muted" style={{ margin: 0 }}>
              {s.points.length >= 3 ? `${s.points.length} hoekpunten getekend op pagina ${s.page + 1}.` : "Nog niet getekend. Klik op de plattegrond op elke hoek van de ruimte, langs de muur."}
            </p>
            <button type="button" className="btn btn-sm" style={{ justifySelf: "start" }} onClick={onDraw}>
              {s.points.length ? "Opnieuw tekenen" : "Teken op de plattegrond"}
            </button>
          </div>
        )}

        {s.kind === "area" && (
          <div className="field full">
            <label htmlFor={`${id}-m2`}>Vloeroppervlakte</label>
            <div className="input-unit">
              <input
                id={`${id}-m2`}
                className="input"
                inputMode="decimal"
                defaultValue={s.m2 === null ? "" : String(s.m2).replace(".", ",")}
                key={`${s.m2}`}
                onBlur={(e) => {
                  const v = parseDecimal(e.target.value);
                  setShape(v === null || v <= 0 ? { ...s, m2: null, status: "missing", source: "gebruiker" } : { ...s, m2: v, status: "confirmed", source: "gebruiker" });
                }}
              />
              <span>m²</span>
            </div>
            <span className="hint">
              {s.status === "auto" && s.m2 !== null ? (
                <span className="row" style={{ gap: 6 }}>
                  <StatusBadge status="auto" /> uit &ldquo;{s.sourceText ?? formatM2(s.m2)}&rdquo;
                </span>
              ) : (
                "Zonder vorm kunnen we geen plinten berekenen."
              )}
            </span>
          </div>
        )}

        <details className="full">
          <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>
            Uitsparingen en obstakels ({room.obstacles.length})
          </summary>
          <div className="stack-sm" style={{ marginTop: 10 }}>
            <p className="tiny muted" style={{ margin: 0 }}>
              Bijvoorbeeld een schoorsteen, kolom of vaste kast waar geen vloer komt. De oppervlakte gaat van de vloer af.
            </p>
            {room.obstacles.map((o, i) => (
              <div key={o.id} className="room-fields" style={{ marginTop: 0, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
                <div className="field full">
                  <label htmlFor={`${id}-o${i}`}>Naam</label>
                  <input
                    id={`${id}-o${i}`}
                    className="input"
                    value={o.name}
                    maxLength={60}
                    onChange={(e) => set({ obstacles: room.obstacles.map((x) => (x.id === o.id ? { ...x, name: e.target.value } : x)) })}
                  />
                </div>
                <LengthInput label="Lengte" value={o.length} onChange={(length) => set({ obstacles: room.obstacles.map((x) => (x.id === o.id ? { ...x, length } : x)) })} />
                <LengthInput label="Breedte" value={o.width} onChange={(width) => set({ obstacles: room.obstacles.map((x) => (x.id === o.id ? { ...x, width } : x)) })} />
                <label className="check small full">
                  <input type="checkbox" checked={o.plinthAround} onChange={(e) => set({ obstacles: room.obstacles.map((x) => (x.id === o.id ? { ...x, plinthAround: e.target.checked } : x)) })} />
                  <span>Plint rondom dit obstakel</span>
                </label>
                <button type="button" className="btn btn-sm btn-ghost full" style={{ justifySelf: "start" }} onClick={() => set({ obstacles: room.obstacles.filter((x) => x.id !== o.id) })}>
                  Obstakel verwijderen
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-sm"
              style={{ justifySelf: "start" }}
              onClick={() => set({ obstacles: [...room.obstacles, { id: randomId(10), name: "Obstakel", length: { ...MISSING }, width: { ...MISSING }, plinthAround: false }] })}
            >
              + Obstakel toevoegen
            </button>
          </div>
        </details>

        <label className="check full">
          <input type="checkbox" checked={room.includeFloor} onChange={(e) => set({ includeFloor: e.target.checked })} />
          <span>Meenemen in de vloerbestelling</span>
        </label>
      </div>

      {(result.issues.length > 0 || room.notes.length > 0) && (
        <ul className="small muted" style={{ margin: "12px 0 0", paddingLeft: 18 }}>
          {[...result.issues, ...room.notes].map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        {hasAuto && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              onChange(confirmRoom(room));
              onConfirmed?.();
            }}
          >
            Naam en maten kloppen
          </button>
        )}
        <button type="button" className="btn btn-sm btn-ghost" onClick={onDelete} aria-label={`Verwijder ${room.name}`}>
          Verwijderen
        </button>
      </div>
    </article>
  );
}
