"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMFromMm, parseDecimal, parseMetresToMm } from "@/lib/format";
import { distance, type Point } from "@/lib/geometry/polygon";
import { mmPerPointForNotation, mmPerUnitFromCalibration } from "@/lib/geometry/units";
import { emptyRect, newRoom } from "@/lib/projects/factory";
import type { Room, Scale } from "@/lib/projects/schema";
import { PlanCanvas, type Tool } from "./PlanCanvas";
import { AutoSummary } from "./AutoSummary";
import { confirmRoom, RoomCard } from "./RoomCard";
import { STAGE_LABEL, useAnalyzer } from "./useAnalyzer";
import { usePlanImage } from "./usePlanImage";
import type { StepProps } from "./types";

export function RoomsStep({ project, update, computed, goTo }: StepProps) {
  const doc = project.document;
  const page = doc ? Math.min(doc.selectedPage, doc.pages.length - 1) : 0;
  const pageInfo = doc?.pages[page] ?? null;
  const image = usePlanImage(project.id, doc, page, doc ? doc.sizeBytes : 0);
  const { state: analysis, run } = useAnalyzer(project.id, update);
  const [tool, setTool] = useState<Tool>("select");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [line, setLine] = useState<{ a: Point; b: Point | null } | null>(null);
  const [calText, setCalText] = useState("");
  const [calError, setCalError] = useState<string | null>(null);
  const [notationText, setNotationText] = useState("");
  const [newName, setNewName] = useState("");

  const scale = project.scales.find((s) => s.page === page) ?? null;
  const pageRooms = project.rooms.filter((r) => r.page === page || (r.shape.kind === "drawn" && r.shape.page === page));
  const pageAnalysis = project.analyses.find((a) => a.page === page) ?? null;

  // Pages of a multi-page PDF are analysed when the user opens them.
  useEffect(() => {
    if (!doc || pageAnalysis || image.missing || (analysis && analysis.page === page)) return;
    void run(doc, page);
  }, [doc, page, pageAnalysis, image.missing, analysis, run]);

  const numbers = useMemo(() => new Map(project.rooms.map((r, i) => [r.id, i + 1])), [project.rooms]);
  const results = computed.rooms;

  function setRoom(room: Room) {
    update((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === room.id ? room : r)) }));
  }

  /** Confirms every automatically measured room on this page that passed all checks, and a proven scale. */
  function confirmAllOk() {
    update((p) => ({
      ...p,
      rooms: p.rooms.map((r) =>
        r.autoOk && r.page === page && r.nameStatus === "auto" && r.shape.kind === "drawn" && r.shape.status === "auto"
          ? confirmRoom(r)
          : r,
      ),
      scales: p.scales.map((s) => (s.page === page && s.method === "maatlijnen" && s.evidence?.proven ? { ...s, status: "confirmed" } : s)),
    }));
  }

  function chooseTool(t: Tool) {
    setTool(t);
    setDraft([]);
    setLine(null);
    setCalError(null);
    // Tools are used on the plan: bring it into view (the buttons can sit below it on small screens).
    if (t !== "select")
      requestAnimationFrame(() => document.querySelector(".plan-wrap")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  function startDrawing(roomId: string | null) {
    let id = roomId;
    if (!id) {
      const room = newRoom(`Ruimte ${project.rooms.length + 1}`, { kind: "drawn", page, points: [], status: "confirmed" }, { page });
      update((p) => ({ ...p, rooms: [...p.rooms, room] }));
      id = room.id;
    }
    setActiveId(id);
    chooseTool("draw");
  }

  function finishDrawing(points: Point[]) {
    if (points.length < 3 || !activeId) return;
    update((p) => ({
      ...p,
      rooms: p.rooms.map((r) =>
        r.id === activeId
          ? { ...r, page, shape: { kind: "drawn", page, points, status: "confirmed" }, wallsWithoutPlinth: [], doors: [] }
          : r,
      ),
    }));
    setDraft([]);
    setTool("select");
  }

  function onPoint(p: Point) {
    if (tool === "draw") {
      if (!activeId) {
        startDrawing(null);
        setDraft([p]);
        return;
      }
      const first = draft[0];
      if (draft.length >= 3 && first && p.x === first.x && p.y === first.y) return finishDrawing(draft);
      setDraft((d) => [...d, p]);
    } else if (tool === "calibrate" || tool === "measure") {
      if (!line || line.b) {
        setLine({ a: p, b: null });
        setCalText("");
      } else {
        const done = { a: line.a, b: p };
        setLine(done);
        if (tool === "calibrate") setCalText(suggestLabel(done.a, done.b) ?? "");
      }
    }
  }

  /** A recognised length label near the middle of the line, offered (not applied) as the real length. */
  function suggestLabel(a: Point, b: Point) {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const len = distance(a, b);
    const near = (pageAnalysis?.lengthLabels ?? [])
      .filter((l) => l.mm !== null)
      .map((l) => ({ l, d: distance(mid, { x: l.box.x + l.box.w / 2, y: l.box.y + l.box.h / 2 }) }))
      .filter((x) => x.d < Math.max(40, len * 0.4))
      .sort((x, y) => x.d - y.d)[0];
    return near ? String(near.l.mm! / 1000).replace(".", ",") : null;
  }

  function saveCalibration() {
    if (!line?.b) return;
    const mm = parseMetresToMm(calText);
    const units = distance(line.a, line.b);
    const mmPerUnit = mm ? mmPerUnitFromCalibration(units, mm) : null;
    if (!mm || !mmPerUnit) {
      setCalError("Vul de echte lengte in meters in, bijvoorbeeld 5,40.");
      return;
    }
    const next: Scale = {
      page,
      mmPerUnit,
      method: "kalibratie",
      status: "confirmed",
      reference: { a: line.a, b: line.b, realMm: mm },
      notation: null,
      evidence: null,
    };
    update((p) => ({ ...p, scales: [...p.scales.filter((s) => s.page !== page), next] }));
    chooseTool("select");
  }

  function saveNotation() {
    const m = /^\s*1\s*:\s*(\d{1,4})\s*$/.exec(notationText);
    const denominator = m ? Number(m[1]) : (parseDecimal(notationText) ?? 0);
    if (!denominator || denominator < 1 || denominator > 1000 || doc?.kind !== "pdf") return;
    const next: Scale = {
      page,
      mmPerUnit: mmPerPointForNotation(denominator),
      method: "schaalnotatie",
      status: "confirmed",
      reference: null,
      notation: denominator,
      evidence: null,
    };
    update((p) => ({ ...p, scales: [...p.scales.filter((s) => s.page !== page), next] }));
    setNotationText("");
  }

  const measured = line?.b && scale ? formatMFromMm(distance(line.a, line.b) * scale.mmPerUnit) : null;

  return (
    <section className="stack" aria-labelledby="stap-kamers">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2 id="stap-kamers" tabIndex={-1}>
              Controleer je kamers
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              Pas namen en maten aan, teken ruimtes na of voeg ze toe. Elke waarde houdt zijn label tot jij hem bevestigt.
            </p>
          </div>
          <div className="room-meta">
            {computed.verified ? (
              <StatusBadge status="derived" label="Alle meegetelde ruimtes gecontroleerd" />
            ) : (
              <StatusBadge status="check" label="Nog niet alles gecontroleerd" />
            )}
          </div>
        </div>

        {(computed.overlaps.length > 0 || computed.duplicateNames.length > 0) && (
          <div className="notice notice-warn" role="status" style={{ marginBottom: 16 }}>
            <ul>
              {computed.overlaps.map(([a, b]) => (
                <li key={`${a}-${b}`}>
                  Ruimte {numbers.get(a)} en {numbers.get(b)} overlappen op de plattegrond. Zo tel je vloer dubbel; pas een van beide aan.
                </li>
              ))}
              {computed.duplicateNames.map((n) => (
                <li key={n}>&ldquo;{n}&rdquo; komt meer dan eens voor. Controleer of het geen dubbele ruimte is.</li>
              ))}
            </ul>
          </div>
        )}

        {pageAnalysis?.auto && (
          <div style={{ marginBottom: 16 }}>
            <AutoSummary analysis={pageAnalysis} scale={scale} rooms={pageRooms} onConfirmAll={confirmAllOk} />
          </div>
        )}

        <div className="editor">
          <div className="editor-plan stack-sm">
            {doc && pageInfo ? (
              <>
                {doc.pages.length > 1 && (
                  <div className="row">
                    <label className="label" htmlFor="pagina">
                      Pagina
                    </label>
                    <select
                      id="pagina"
                      className="select"
                      style={{ width: "auto" }}
                      value={page}
                      onChange={(e) => {
                        chooseTool("select");
                        update((p) => (p.document ? { ...p, document: { ...p.document, selectedPage: Number(e.target.value) } } : p));
                      }}
                    >
                      {doc.pages.map((pg) => (
                        <option key={pg.index} value={pg.index}>
                          {pg.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="toolbar" role="toolbar" aria-label="Gereedschap">
                  {(
                    [
                      ["select", "Selecteren"],
                      ["draw", "Ruimte tekenen"],
                      ["calibrate", "Schaal kalibreren"],
                      ["measure", "Meten"],
                    ] as [Tool, string][]
                  ).map(([t, label]) => (
                    <button
                      key={t}
                      type="button"
                      className={`btn btn-sm ${tool === t ? "btn-primary" : ""}`}
                      aria-pressed={tool === t}
                      disabled={t === "measure" && !scale}
                      onClick={() =>
                        t === "draw"
                          ? startDrawing(activeId && project.rooms.find((r) => r.id === activeId)?.shape.kind === "drawn" ? activeId : null)
                          : chooseTool(t)
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <PlanCanvas
                  page={pageInfo}
                  imageUrl={image.url}
                  status={
                    image.missing
                      ? "Het bestand staat niet meer op dit apparaat. Je kamers en maten blijven bewaard; upload opnieuw om de plattegrond te zien."
                      : image.error
                  }
                  tool={tool}
                  rooms={pageRooms.map((r) => ({
                    id: r.id,
                    number: numbers.get(r.id) ?? 0,
                    name: r.name,
                    points: r.shape.kind === "drawn" && r.shape.page === page ? r.shape.points : [],
                    anchor: r.anchor,
                    active: r.id === activeId,
                    included: r.includeFloor,
                  }))}
                  windows={project.windows
                    .filter((w) => w.page === page && w.position)
                    .map((w) => ({ id: w.id, code: w.code, position: w.position!, active: false }))}
                  draft={draft}
                  line={line ? { ...line, label: tool === "measure" ? measured : null } : null}
                  labels={(pageAnalysis?.lengthLabels ?? []).map((l) => ({ box: l.box, text: l.text }))}
                  onPoint={onPoint}
                  onRoomClick={(id) => setActiveId(id)}
                  onCancel={() => chooseTool("select")}
                  onUndo={() => setDraft((d) => d.slice(0, -1))}
                />

                {tool === "draw" && (
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={draft.length < 3}
                      onClick={() => finishDrawing(draft)}
                    >
                      Klaar ({draft.length} punten)
                    </button>
                    <button type="button" className="btn btn-sm" disabled={!draft.length} onClick={() => setDraft((d) => d.slice(0, -1))}>
                      Laatste punt weg
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => chooseTool("select")}>
                      Annuleren
                    </button>
                  </div>
                )}

                {tool === "calibrate" && line?.b && (
                  <div className="card-flat stack-sm">
                    <div className="field">
                      <label htmlFor="cal-len">Hoe lang is deze lijn in werkelijkheid?</label>
                      <div className="input-unit" style={{ maxWidth: 220 }}>
                        <input
                          id="cal-len"
                          className="input"
                          inputMode="decimal"
                          value={calText}
                          onChange={(e) => setCalText(e.target.value)}
                          aria-invalid={Boolean(calError)}
                          autoFocus
                        />
                        <span>m</span>
                      </div>
                      <span className="hint">
                        {calError ??
                          (calText ? "Ingevuld vanuit een maatlabel op de tekening. Controleer of het klopt." : "Bijvoorbeeld 5,40")}
                      </span>
                    </div>
                    <div className="row">
                      <button type="button" className="btn btn-sm btn-primary" onClick={saveCalibration}>
                        Schaal opslaan
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLine(null)}>
                        Opnieuw
                      </button>
                    </div>
                  </div>
                )}

                {analysis && analysis.page === page && !analysis.done && (
                  <p className="notice" aria-live="polite">
                    {analysis.stage ? STAGE_LABEL[analysis.stage.stage] : "Pagina lezen"}
                    {analysis.stage?.stage === "ocr" && analysis.stage.fraction !== undefined
                      ? ` — ${Math.round(analysis.stage.fraction * 100)}%`
                      : ""}
                    …
                  </p>
                )}
              </>
            ) : (
              <div className="card-flat stack-sm">
                <h3>Handmatig invoeren</h3>
                <p className="small muted">
                  Je hebt (nog) geen plattegrond toegevoegd. Voeg de ruimtes toe met lengte en breedte, een L-vorm of alleen de oppervlakte.
                  Meet zelf of neem de maten over van je tekening.
                </p>
                <button type="button" className="btn btn-sm" style={{ justifySelf: "start" }} onClick={() => goTo("plattegrond")}>
                  Toch een plattegrond uploaden
                </button>
              </div>
            )}

            {doc && (
              <div className="card-flat stack-sm" aria-labelledby="schaal-titel">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h3 id="schaal-titel" style={{ margin: 0 }}>
                    Schaal van deze pagina
                  </h3>
                  {scale ? (
                    <StatusBadge status={scale.status === "confirmed" ? "confirmed" : "auto"} />
                  ) : (
                    <StatusBadge status="missing" label="Onbekend" />
                  )}
                </div>
                {scale ? (
                  <p className="small" style={{ margin: 0 }}>
                    {scale.method === "schaalnotatie"
                      ? `Schaal 1:${scale.notation} ${scale.status === "auto" ? "gevonden op de tekening" : "ingesteld"}. Dit klopt alleen als de PDF op ware papiergrootte is opgeslagen.`
                      : scale.method === "maatlijnen"
                        ? `Afgeleid uit ${scale.evidence?.agreeing ?? "de"} maatlijnen op de tekening die onderling kloppen${scale.evidence ? ` (±${(scale.evidence.uncertainty * 100).toFixed(1).replace(".", ",")} %)` : ""}. Controleer gerust met een maat die je zelf kent.`
                        : `Gekalibreerd op een lijn van ${formatMFromMm(scale.reference?.realMm ?? 0)}.`}
                  </p>
                ) : (
                  <p className="small" style={{ margin: 0 }}>
                    Zonder schaal kunnen we getekende ruimtes niet omrekenen naar meters.{" "}
                    {pageAnalysis?.notToScale ? "Op de tekening staat dat hij niet op schaal is." : ""} Kalibreer met een maat die je kent,
                    of gebruik lengte × breedte per kamer.
                  </p>
                )}
                <div className="row">
                  <button type="button" className="btn btn-sm" onClick={() => chooseTool("calibrate")}>
                    {scale ? "Opnieuw kalibreren" : "Kalibreer met een bekende maat"}
                  </button>
                  {scale && (
                    <button type="button" className="btn btn-sm" onClick={() => chooseTool("measure")}>
                      Controleer met een andere maat
                    </button>
                  )}
                  {scale?.status === "auto" && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        update((p) => ({ ...p, scales: p.scales.map((s) => (s.page === page ? { ...s, status: "confirmed" } : s)) }))
                      }
                    >
                      Ik heb een maat nagemeten: schaal klopt
                    </button>
                  )}
                </div>
                {tool === "measure" && measured && (
                  <p className="notice small" role="status" style={{ margin: 0 }}>
                    Gemeten: <strong>{measured}</strong> volgens de huidige schaal. Komt dit overeen met de maat op de tekening of in je
                    woning?
                  </p>
                )}
                {doc.kind === "pdf" && !scale && (
                  <div className="row">
                    <label className="small" htmlFor="notatie">
                      Of vul de schaal van de tekening in:
                    </label>
                    <input
                      id="notatie"
                      className="input"
                      style={{ width: 110 }}
                      placeholder="1:100"
                      value={notationText}
                      onChange={(e) => setNotationText(e.target.value)}
                    />
                    <button type="button" className="btn btn-sm" onClick={saveNotation}>
                      Gebruiken
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="stack">
            <div className="room-list">
              {results.length === 0 && <p className="notice">Nog geen ruimtes. Voeg er een toe of teken er een op de plattegrond.</p>}
              {results.map((res) => (
                <RoomCard
                  key={res.room.id}
                  number={numbers.get(res.room.id) ?? 0}
                  result={res}
                  active={res.room.id === activeId}
                  page={page}
                  hasPlan={Boolean(doc)}
                  onActivate={() => setActiveId(res.room.id)}
                  onChange={setRoom}
                  onDelete={() =>
                    update((p) => ({
                      ...p,
                      rooms: p.rooms.filter((r) => r.id !== res.room.id),
                      windows: p.windows.map((w) => (w.roomId === res.room.id ? { ...w, roomId: null } : w)),
                    }))
                  }
                  onDraw={() => startDrawing(res.room.id)}
                  onConfirmed={() => {
                    const i = results.findIndex((x) => x.room.id === res.room.id);
                    const next = [...results.slice(i + 1), ...results.slice(0, i)].find((x) => x.status !== "derived");
                    setActiveId(next?.room.id ?? null);
                  }}
                />
              ))}
            </div>

            <form
              className="card-flat stack-sm"
              onSubmit={(e) => {
                e.preventDefault();
                const name = newName.trim() || `Ruimte ${project.rooms.length + 1}`;
                const room = newRoom(name, emptyRect(), { page: doc ? page : null });
                update((p) => ({ ...p, rooms: [...p.rooms, room] }));
                setActiveId(room.id);
                setNewName("");
              }}
            >
              <label className="label" htmlFor="nieuwe-ruimte">
                Ruimte toevoegen
              </label>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input
                  id="nieuwe-ruimte"
                  className="input"
                  placeholder="Bijvoorbeeld Slaapkamer 3"
                  value={newName}
                  maxLength={60}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <button type="submit" className="btn btn-primary">
                  Toevoegen
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="row">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => goTo("vloer")}>
          Bereken mijn vloer
        </button>
      </div>
    </section>
  );
}
