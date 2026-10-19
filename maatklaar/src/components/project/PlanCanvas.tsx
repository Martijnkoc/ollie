"use client";

import { useEffect, useRef, useState } from "react";
import { centroid, type Point } from "@/lib/geometry/polygon";

export type Tool = "select" | "draw" | "calibrate" | "measure" | "window";

export type CanvasRoom = {
  id: string;
  number: number;
  name: string;
  points: Point[];
  anchor: Point | null;
  active: boolean;
  included: boolean;
};
export type CanvasWindow = { id: string; code: string; position: Point; active: boolean };

const TOOL_HELP: Record<Tool, string> = {
  select: "Kies een ruimte door erop te klikken.",
  draw: "Klik op elke hoek van de ruimte, langs de muur. Klik op het eerste punt of kies Klaar om af te sluiten. Escape annuleert.",
  calibrate: "Klik op het begin en het eind van een maat die je kent, bijvoorbeeld een maatlijn met een getal.",
  measure: "Klik op twee punten om de afstand te meten met de huidige schaal.",
  window: "Klik op de plek van het raam op de plattegrond.",
};

/**
 * The plan with an editable SVG overlay. Coordinates are page units (PDF points or image pixels); the
 * overlay uses the page size as viewBox so it lines up with the rendered image at every zoom level.
 */
export function PlanCanvas({
  page,
  imageUrl,
  status,
  tool,
  rooms,
  windows,
  draft,
  line,
  labels,
  onPoint,
  onRoomClick,
  onCancel,
  onUndo,
}: {
  page: { width: number; height: number };
  imageUrl: string | null;
  status: string | null;
  tool: Tool;
  rooms: CanvasRoom[];
  windows: CanvasWindow[];
  draft: Point[];
  line: { a: Point; b: Point | null; label: string | null } | null;
  labels: { box: { x: number; y: number; w: number; h: number }; text: string }[];
  onPoint: (p: Point) => void;
  onRoomClick: (id: string) => void;
  onCancel: () => void;
  onUndo: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [unitPerPx, setUnitPerPx] = useState(1);
  const [hover, setHover] = useState<Point | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setUnitPerPx(page.width / w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [page.width, imageUrl]);

  function toPage(e: React.PointerEvent): Point | null {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: Math.max(0, Math.min(page.width, pt.x)), y: Math.max(0, Math.min(page.height, pt.y)) };
  }

  /** Holds walls straight: snaps to horizontal/vertical from the previous point, and closes on the first point. */
  function snap(p: Point): Point {
    if (tool !== "draw" || !draft.length) return p;
    const first = draft[0]!;
    if (draft.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) < 12 * unitPerPx) return first;
    const prev = draft[draft.length - 1]!;
    const dx = Math.abs(p.x - prev.x);
    const dy = Math.abs(p.y - prev.y);
    if (dx < dy * 0.08) return { x: prev.x, y: p.y };
    if (dy < dx * 0.08) return { x: p.x, y: prev.y };
    return p;
  }

  const u = unitPerPx; // one screen pixel in page units
  const r = (px: number) => px * u;

  return (
    <div className="stack-sm">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="small muted" style={{ margin: 0 }} id="canvas-help">
          {TOOL_HELP[tool]}
        </p>
        <div className="row" style={{ gap: 6 }} role="group" aria-label="Zoom">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setZoom((z) => Math.max(1, z / 1.5))}
            aria-label="Uitzoomen"
            disabled={zoom <= 1}
          >
            −
          </button>
          <span className="small" aria-live="polite" style={{ minWidth: 44, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" className="btn btn-sm" onClick={() => setZoom((z) => Math.min(6, z * 1.5))} aria-label="Inzoomen">
            +
          </button>
        </div>
      </div>
      <div className="plan-wrap">
        <div className="plan-inner" style={{ width: `${zoom * 100}%` }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="Je plattegrond" draggable={false} />
          ) : (
            <div
              style={{
                aspectRatio: `${page.width} / ${page.height}`,
                display: "grid",
                placeItems: "center",
                background: "var(--surface-2)",
              }}
            >
              <span className="small muted" style={{ padding: 16, textAlign: "center" }}>
                {status ?? "Plattegrond laden…"}
              </span>
            </div>
          )}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${page.width} ${page.height}`}
            preserveAspectRatio="none"
            data-tool={tool}
            tabIndex={0}
            role="application"
            aria-label="Plattegrond met ruimtes. Gebruik de knoppen naast de plattegrond als je niet met een muis of vinger kunt tekenen."
            aria-describedby="canvas-help"
            onPointerMove={(e) => {
              if (tool === "select") return;
              const p = toPage(e);
              setHover(p ? snap(p) : null);
            }}
            onPointerLeave={() => setHover(null)}
            onPointerUp={(e) => {
              if (tool === "select" || e.button !== 0) return;
              const p = toPage(e);
              if (p) onPoint(snap(p));
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
              if ((e.key === "Backspace" || e.key === "Delete") && draft.length) {
                e.preventDefault();
                onUndo();
              }
            }}
          >
            {tool === "calibrate" &&
              labels.map((l, i) => (
                <rect
                  key={i}
                  x={l.box.x - r(3)}
                  y={l.box.y - r(3)}
                  width={l.box.w + r(6)}
                  height={l.box.h + r(6)}
                  fill="rgba(185,140,60,0.18)"
                  stroke="#b98c3c"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  rx={r(3)}
                />
              ))}
            {rooms.map((room) => {
              const c = room.points.length >= 3 ? centroid(room.points) : room.anchor;
              return (
                <g
                  key={room.id}
                  onPointerUp={(e) => tool === "select" && (e.stopPropagation(), onRoomClick(room.id))}
                  style={{ cursor: tool === "select" ? "pointer" : undefined }}
                >
                  {room.points.length >= 3 && (
                    <polygon
                      points={room.points.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill={room.active ? "rgba(43,106,80,0.30)" : room.included ? "rgba(43,106,80,0.16)" : "rgba(107,116,111,0.12)"}
                      stroke={room.active ? "#1f4d3a" : "#2b6a50"}
                      strokeWidth={room.active ? 3 : 2}
                      vectorEffect="non-scaling-stroke"
                      strokeDasharray={room.included ? undefined : "6 4"}
                    />
                  )}
                  {c && (
                    <g transform={`translate(${c.x} ${c.y})`}>
                      <circle
                        r={r(13)}
                        fill={room.active ? "#b98c3c" : "#1f4d3a"}
                        stroke="#fff"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                      />
                      <text y={r(4.5)} textAnchor="middle" fontSize={r(13)} fontWeight={700} fill="#fff" fontFamily="Inter, sans-serif">
                        {room.number}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
            {windows.map((w) => (
              <g key={w.id} transform={`translate(${w.position.x} ${w.position.y})`}>
                <rect
                  x={r(-20)}
                  y={r(-11)}
                  width={r(40)}
                  height={r(22)}
                  rx={r(11)}
                  fill={w.active ? "#1f4d3a" : "#b98c3c"}
                  stroke="#fff"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
                <text y={r(4.5)} textAnchor="middle" fontSize={r(12)} fontWeight={700} fill="#fff" fontFamily="ui-monospace, monospace">
                  {w.code}
                </text>
              </g>
            ))}
            {draft.length > 0 && (
              <g>
                <polyline
                  points={[...draft, ...(hover ? [hover] : [])].map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(185,140,60,0.12)"
                  stroke="#b98c3c"
                  strokeWidth={2.5}
                  vectorEffect="non-scaling-stroke"
                />
                {draft.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={r(i === 0 ? 7 : 5)}
                    fill={i === 0 ? "#fff" : "#b98c3c"}
                    stroke="#b98c3c"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            )}
            {line && (
              <g>
                <line
                  x1={line.a.x}
                  y1={line.a.y}
                  x2={(line.b ?? hover ?? line.a).x}
                  y2={(line.b ?? hover ?? line.a).y}
                  stroke="#1f4d3a"
                  strokeWidth={3}
                  vectorEffect="non-scaling-stroke"
                />
                {[line.a, line.b]
                  .filter((p): p is Point => Boolean(p))
                  .map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={r(6)}
                      fill="#fff"
                      stroke="#1f4d3a"
                      strokeWidth={2.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                {line.b && line.label && (
                  <g transform={`translate(${(line.a.x + line.b.x) / 2} ${(line.a.y + line.b.y) / 2})`}>
                    <rect x={r(-46)} y={r(-30)} width={r(92)} height={r(22)} rx={r(6)} fill="#1f4d3a" />
                    <text y={r(-14)} textAnchor="middle" fontSize={r(13)} fontWeight={700} fill="#fff" fontFamily="Inter, sans-serif">
                      {line.label}
                    </text>
                  </g>
                )}
              </g>
            )}
            {hover && tool !== "select" && <circle cx={hover.x} cy={hover.y} r={r(4)} fill="#1f4d3a" pointerEvents="none" />}
          </svg>
        </div>
      </div>
    </div>
  );
}
