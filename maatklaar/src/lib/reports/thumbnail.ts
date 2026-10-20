"use client";

import { renderPageCanvas } from "@/lib/documents/render";
import { centroid } from "@/lib/geometry/polygon";
import type { Project } from "@/lib/projects/schema";
import { loadFile } from "@/lib/projects/store";

/**
 * Renders the selected plan page with numbered rooms and window codes for the PDF, in the browser.
 * Returns null when the file is no longer on this device or the page cannot be drawn.
 */
export async function planThumbnail(project: Project): Promise<{ png: Uint8Array; width: number; height: number; page: number } | null> {
  const doc = project.document;
  if (!doc) return null;
  const blob = await loadFile(project.id);
  if (!blob) return null;
  const page = Math.min(doc.selectedPage, doc.pages.length - 1);
  try {
    const { canvas, pxPerUnit } = await renderPageCanvas(blob, doc.kind, page, 1600);
    const ctx = canvas.getContext("2d")!;
    const s = pxPerUnit;
    const r = Math.max(12, canvas.width / 70);
    const badge = (x: number, y: number, label: string, fill: string, pill = false) => {
      ctx.font = `700 ${Math.round(r * 1.05)}px Helvetica, Arial, sans-serif`;
      const w = pill ? ctx.measureText(label).width + r * 1.4 : r * 2;
      ctx.fillStyle = fill;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(2, r / 5);
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - r, w, r * 2, pill ? r * 0.4 : r);
      ctx.fill();
      ctx.stroke();
      // Graphite on signal orange, white on graphite: both readable.
      ctx.fillStyle = fill === "#ff6a35" ? "#191c1a" : "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x, y + 1);
    };
    project.rooms.forEach((room, i) => {
      const shape = room.shape;
      if (shape.kind === "drawn" && shape.page === page && shape.points.length >= 3) {
        ctx.beginPath();
        shape.points.forEach((p, j) => (j ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s)));
        ctx.closePath();
        ctx.fillStyle = room.includeFloor ? "rgba(255,106,53,0.18)" : "rgba(107,116,111,0.12)";
        ctx.fill();
        ctx.strokeStyle = "#191c1a";
        ctx.lineWidth = Math.max(2, r / 4);
        ctx.stroke();
        const c = centroid(shape.points);
        badge(c.x * s, c.y * s, String(i + 1), "#191c1a");
      } else if (room.page === page && room.anchor) {
        badge(room.anchor.x * s, room.anchor.y * s - r * 1.6, String(i + 1), "#191c1a");
      }
    });
    for (const w of project.windows) if (w.page === page && w.position) badge(w.position.x * s, w.position.y * s, w.code, "#ff6a35", true);
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!out) return null;
    return { png: new Uint8Array(await out.arrayBuffer()), width: canvas.width, height: canvas.height, page };
  } catch {
    return null;
  }
}
