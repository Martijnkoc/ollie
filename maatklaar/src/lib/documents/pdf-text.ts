import type { TextItem } from "@/lib/plan-analysis/types";

/** Minimal shape of a PDF.js text item, so this mapping stays pure and testable without PDF.js. */
export type PdfJsTextItem = { str: string; transform: number[]; width: number; height: number };

type Matrix = [number, number, number, number, number, number];

function multiply(m1: readonly number[], m2: readonly number[]): Matrix {
  const [a1 = 0, b1 = 0, c1 = 0, d1 = 0, e1 = 0, f1 = 0] = m1;
  const [a2 = 0, b2 = 0, c2 = 0, d2 = 0, e2 = 0, f2 = 0] = m2;
  return [a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1];
}

/**
 * Maps PDF.js text items to page-unit boxes (top-left origin, y down) using the viewport transform of a
 * scale-1 viewport. Handles rotated text by transforming the four corners of each item.
 */
export function pdfItemsToText(items: readonly PdfJsTextItem[], viewportTransform: readonly number[]): TextItem[] {
  const out: TextItem[] = [];
  for (const item of items) {
    const text = item.str.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const m = multiply(viewportTransform, item.transform);
    const ulen = Math.hypot(m[0], m[1]) || 1;
    const vlen = Math.hypot(m[2], m[3]) || 1;
    const u = { x: m[0] / ulen, y: m[1] / ulen };
    // Text "up" in viewport space; its length is the font size.
    const v = { x: m[2] / vlen, y: m[3] / vlen };
    const h = vlen;
    const w = item.width;
    const p0 = { x: m[4], y: m[5] };
    const corners = [p0, { x: p0.x + u.x * w, y: p0.y + u.y * w }, { x: p0.x + v.x * h, y: p0.y + v.y * h }, { x: p0.x + u.x * w + v.x * h, y: p0.y + u.y * w + v.y * h }];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    out.push({ text, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, source: "pdf-tekst", confidence: null, vertical: Math.abs(u.y) > Math.abs(u.x) });
  }
  return out;
}
