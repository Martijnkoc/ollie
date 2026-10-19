"use client";

import { useEffect, useRef, useState } from "react";
import { refineQuad, type Gray } from "@/lib/measurements/edges";
import { isConvexQuad, type Marked, type Pt } from "@/lib/measurements/photo";

export type MarkerGroup = {
  /** Shown in the prompt, e.g. "A4-vel" or "Raamopening". */
  title: string;
  labels: string[];
  shape: "quad" | "lines";
  color: string;
};

/** A dragged point moves this many times slower than the finger: precise without zooming the photo. */
const FINE = 6;
const LOUPE = 128;

/**
 * Points on a photo, for measuring: tap to place (the loupe shows what is under your finger), drag a point
 * to move it finely, or use the keyboard. Quadrilaterals snap to the edges in the photo when their four
 * corners are placed; a corner without a clear edge stays where it was put.
 */
export function PhotoMarker({
  photo,
  gray,
  groups,
  points,
  snapped,
  snap,
  onChange,
}: {
  photo: { url: string; width: number; height: number };
  gray: Gray | null;
  groups: MarkerGroup[];
  points: Marked[];
  snapped: boolean[];
  snap: boolean;
  onChange: (points: Marked[], snapped: boolean[]) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [active, setActive] = useState<number | null>(null);
  const [showLoupe, setShowLoupe] = useState(false);
  const drag = useRef<{ index: number; mode: "place" | "fine"; client: Pt; start: Pt } | null>(null);
  const total = groups.reduce((n, g) => n + g.labels.length, 0);

  // Fit the photo in the available width and at most 58 % of the screen height.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const maxW = el.clientWidth;
      const maxH = Math.max(240, window.innerHeight * 0.58);
      const s = Math.min(maxW / photo.width, maxH / photo.height);
      setBox({ w: Math.round(photo.width * s), h: Math.round(photo.height * s) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [photo.width, photo.height]);

  const perCss = box.w ? photo.width / box.w : 1;
  /** Position uncertainty of a hand-placed point: what one screen pixel of fine dragging covers. */
  const tapSigma = Math.max(0.5, (perCss / FINE) * 1.5);

  const groupOf = (i: number) => {
    let start = 0;
    for (const g of groups) {
      if (i < start + g.labels.length) return { group: g, start, index: i - start };
      start += g.labels.length;
    }
    return null;
  };

  function toPhoto(e: { clientX: number; clientY: number }): Pt | null {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: Math.max(0, Math.min(photo.width, p.x)), y: Math.max(0, Math.min(photo.height, p.y)) };
  }

  /** Snaps a complete quadrilateral group onto the edges in the photo. */
  function snapGroup(ps: Marked[], flags: boolean[], i: number): [Marked[], boolean[]] {
    const g = groupOf(i);
    if (!snap || !gray || !g || g.group.shape !== "quad") return [ps, flags];
    const quad = ps.slice(g.start, g.start + 4);
    if (quad.length < 4 || !isConvexQuad(quad)) return [ps, flags];
    const r = refineQuad(gray, quad);
    const next = [...ps];
    const nextFlags = [...flags];
    r.corners.forEach((c, k) => {
      next[g.start + k] = c;
      nextFlags[g.start + k] = r.refined[k]!;
    });
    return [next, nextFlags];
  }

  function set(i: number, p: Pt) {
    const next = [...points];
    next[i] = { ...p, sigma: tapSigma };
    const flags = [...snapped];
    flags[i] = false;
    onChange(next, flags);
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const target = e.target as Element;
    const handle = target.getAttribute("data-index");
    const p = toPhoto(e);
    if (!p) return;
    if (handle !== null) {
      const index = Number(handle);
      drag.current = { index, mode: "fine", client: { x: e.clientX, y: e.clientY }, start: points[index]! };
    } else if (points.length < total) {
      const index = points.length;
      drag.current = { index, mode: "place", client: { x: e.clientX, y: e.clientY }, start: p };
      onChange([...points, { ...p, sigma: tapSigma }], [...snapped, false]);
    } else return;
    e.preventDefault();
    svg.current?.setPointerCapture(e.pointerId);
    setActive(drag.current.index);
    setShowLoupe(true);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "place") {
      const p = toPhoto(e);
      if (p) set(d.index, p);
    } else {
      const k = perCss / FINE;
      set(d.index, {
        x: Math.max(0, Math.min(photo.width, d.start.x + (e.clientX - d.client.x) * k)),
        y: Math.max(0, Math.min(photo.height, d.start.y + (e.clientY - d.client.y) * k)),
      });
    }
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    setShowLoupe(false);
    if (!d) return;
    const [ps, flags] = snapGroup(points, snapped, d.index);
    if (ps !== points) onChange(ps, flags);
  }

  function onKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if ((e.key === "Enter" || e.key === " ") && points.length < total) {
      e.preventDefault();
      const last = points[points.length - 1];
      const p = last ? { x: Math.min(photo.width, last.x + photo.width * 0.05), y: last.y } : { x: photo.width / 2, y: photo.height / 2 };
      onChange([...points, { ...p, sigma: tapSigma }], [...snapped, false]);
      setActive(points.length);
      return;
    }
    if ((e.key === "PageUp" || e.key === "PageDown") && points.length) {
      e.preventDefault();
      const cur = active ?? points.length - 1;
      setActive((cur + (e.key === "PageDown" ? 1 : points.length - 1)) % points.length);
      return;
    }
    const step = e.shiftKey ? 10 : e.altKey ? 0.25 : 1;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (move && points.length) {
      e.preventDefault();
      const i = active ?? points.length - 1;
      setActive(i);
      setShowLoupe(true);
      // Keyboard placement is exact to the step; it needs no finger margin.
      const next = [...points];
      next[i] = {
        x: Math.max(0, Math.min(photo.width, points[i]!.x + move[0]!)),
        y: Math.max(0, Math.min(photo.height, points[i]!.y + move[1]!)),
        sigma: 0.5,
      };
      const flags = [...snapped];
      flags[i] = false;
      onChange(next, flags);
    }
  }

  // The greyscale arrives a moment after the photo: snap the corners that were placed before it was ready.
  // Only quadrilaterals of which no corner snapped yet; a corner moved by hand afterwards stays as it is.
  useEffect(() => {
    if (!gray || !snap) return;
    let ps = points;
    let flags = snapped;
    let start = 0;
    for (const g of groups) {
      const n = g.labels.length;
      if (g.shape === "quad" && ps.length >= start + n && !flags.slice(start, start + n).some(Boolean))
        [ps, flags] = snapGroup(ps, flags, start);
      start += n;
    }
    if (ps !== points) onChange(ps, flags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gray]);

  const next = points.length < total ? groupOf(points.length) : null;
  const prompt = next ? `${next.group.title}: ${next.group.labels[next.index]}` : null;
  const u = perCss;
  const loupeAt = active !== null && showLoupe ? points[active] : null;
  const zoom = Math.min(FINE, Math.max(2, perCss * 1.5));

  return (
    <div className="stack-sm">
      <p className="small" style={{ margin: 0 }} aria-live="polite">
        <strong>{prompt ? `Tik aan: ${prompt}` : "Alle punten staan. Sleep een punt om het precies te leggen."}</strong>
      </p>
      <div ref={wrap} className="marker-wrap">
        <div className="marker-stage" style={{ width: box.w || "100%", height: box.h || undefined }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="Foto om in te meten" draggable={false} />
          <svg
            ref={svg}
            viewBox={`0 0 ${photo.width} ${photo.height}`}
            preserveAspectRatio="none"
            role="application"
            aria-label="Foto: punten aanwijzen"
            aria-describedby="marker-keys"
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            onKeyUp={() => setShowLoupe(false)}
            onBlur={() => setShowLoupe(false)}
          >
            {groups.map((g, gi) => {
              const start = groups.slice(0, gi).reduce((n, x) => n + x.labels.length, 0);
              const ps = points.slice(start, start + g.labels.length);
              if (g.shape === "quad")
                return (
                  ps.length > 1 && (
                    <polygon
                      key={gi}
                      points={ps.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill={`${g.color}22`}
                      stroke={g.color}
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  )
                );
              return ps.map(
                (p, k) =>
                  k % 2 === 1 && (
                    <line
                      key={`${gi}-${k}`}
                      x1={ps[k - 1]!.x}
                      y1={ps[k - 1]!.y}
                      x2={p.x}
                      y2={p.y}
                      stroke={g.color}
                      strokeWidth={3}
                      vectorEffect="non-scaling-stroke"
                    />
                  ),
              );
            })}
            {points.map((p, i) => {
              const g = groupOf(i);
              return (
                <g key={i}>
                  {/* A generous invisible target for fingers; the visible dot stays small to keep the corner visible. */}
                  <circle data-index={i} cx={p.x} cy={p.y} r={16 * u} fill="transparent" style={{ cursor: "grab" }} />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={(i === active ? 6 : 4.5) * u}
                    fill={snapped[i] ? "#fff" : (g?.group.color ?? "#000")}
                    stroke={g?.group.color ?? "#000"}
                    strokeWidth={snapped[i] ? 3 : 1.5}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                </g>
              );
            })}
          </svg>
          {loupeAt && box.w > 0 && (
            <div
              className="loupe"
              aria-hidden="true"
              style={{
                width: LOUPE,
                height: LOUPE,
                left: Math.max(0, Math.min(box.w - LOUPE, loupeAt.x / perCss - LOUPE / 2)),
                top: loupeAt.y / perCss - LOUPE - 36 >= 0 ? loupeAt.y / perCss - LOUPE - 36 : loupeAt.y / perCss + 36,
                backgroundImage: `url(${photo.url})`,
                backgroundSize: `${box.w * zoom}px ${box.h * zoom}px`,
                backgroundPosition: `${-(loupeAt.x / perCss) * zoom + LOUPE / 2}px ${-(loupeAt.y / perCss) * zoom + LOUPE / 2}px`,
              }}
            />
          )}
        </div>
      </div>
      {snap && !gray && (
        <p className="tiny muted" style={{ margin: 0 }} role="status">
          Randen in de foto zoeken…
        </p>
      )}
      <p id="marker-keys" className="tiny muted" style={{ margin: 0 }}>
        Tik om een punt te zetten; houd vast en schuif om het onder de loep precies te leggen. Daarna kun je elk punt fijn verslepen. Met
        het toetsenbord: Enter zet een punt, pijltjes verschuiven (Shift = 10 pixels, Alt = een kwart pixel), Page Up/Down kiest een ander
        punt. Witte stippen liggen op een rand in de foto.
      </p>
    </div>
  );
}
