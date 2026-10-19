"use client";

import { renderPageCanvas } from "@/lib/documents/render";
import { centroid } from "@/lib/geometry/polygon";
import type { Project } from "@/lib/projects/schema";
import { loadFile, loadPhoto } from "@/lib/projects/store";

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
      ctx.roundRect(x - w / 2, y - r, w, r * 2, r);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
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
        ctx.fillStyle = room.includeFloor ? "rgba(43,106,80,0.18)" : "rgba(107,116,111,0.12)";
        ctx.fill();
        ctx.strokeStyle = "#1f4d3a";
        ctx.lineWidth = Math.max(2, r / 4);
        ctx.stroke();
        const c = centroid(shape.points);
        badge(c.x * s, c.y * s, String(i + 1), "#1f4d3a");
      } else if (room.page === page && room.anchor) {
        badge(room.anchor.x * s, room.anchor.y * s - r * 1.6, String(i + 1), "#1f4d3a");
      }
    });
    for (const w of project.windows) if (w.page === page && w.position) badge(w.position.x * s, w.position.y * s, w.code, "#b98c3c", true);
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!out) return null;
    return { png: new Uint8Array(await out.arrayBuffer()), width: canvas.width, height: canvas.height, page };
  } catch {
    return null;
  }
}

/**
 * JPEG crops of the window photos for the report: the opening the user tapped plus a margin, or the
 * whole photo when no corners were tapped. Photos are read from this device only.
 */
export async function windowPhotoCrops(project: Project): Promise<Record<string, { jpg: Uint8Array; width: number; height: number }>> {
  const out: Record<string, { jpg: Uint8Array; width: number; height: number }> = {};
  for (const w of project.windows) {
    if (!w.photo) continue;
    const blob = await loadPhoto(project.id, w.id);
    if (!blob) continue;
    try {
      const bitmap = await createImageBitmap(blob);
      const pts = w.photo.opening.length === 4 ? w.photo.opening : [];
      const sx = bitmap.width / w.photo.width;
      const sy = bitmap.height / w.photo.height;
      let x0 = 0;
      let y0 = 0;
      let x1 = bitmap.width;
      let y1 = bitmap.height;
      if (pts.length) {
        const xs = pts.map((p) => p.x * sx);
        const ys = pts.map((p) => p.y * sy);
        const mx = (Math.max(...xs) - Math.min(...xs)) * 0.12;
        const my = (Math.max(...ys) - Math.min(...ys)) * 0.12;
        x0 = Math.max(0, Math.min(...xs) - mx);
        y0 = Math.max(0, Math.min(...ys) - my);
        x1 = Math.min(bitmap.width, Math.max(...xs) + mx);
        y1 = Math.min(bitmap.height, Math.max(...ys) + my);
      }
      const scale = Math.min(1, 480 / Math.max(x1 - x0, y1 - y0));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((x1 - x0) * scale));
      canvas.height = Math.max(1, Math.round((y1 - y0) * scale));
      canvas.getContext("2d")!.drawImage(bitmap, x0, y0, x1 - x0, y1 - y0, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const jpg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
      if (jpg) out[w.id] = { jpg: new Uint8Array(await jpg.arrayBuffer()), width: canvas.width, height: canvas.height };
    } catch {
      // A photo that cannot be decoded is simply left out of the report.
    }
  }
  return out;
}
