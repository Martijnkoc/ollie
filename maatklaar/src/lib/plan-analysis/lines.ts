import type { TextItem } from "./types";

export type TextLine = TextItem & { parts: TextItem[] };

function join(parts: TextItem[]): TextLine {
  const x1 = Math.min(...parts.map((p) => p.x));
  const y1 = Math.min(...parts.map((p) => p.y));
  const x2 = Math.max(...parts.map((p) => p.x + p.w));
  const y2 = Math.max(...parts.map((p) => p.y + p.h));
  let text = "";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (i > 0) {
      const prev = parts[i - 1]!;
      const gap = p.x - (prev.x + prev.w);
      if (gap > Math.min(prev.h, p.h) * 0.15) text += " ";
    }
    text += p.text.trim();
  }
  const confs = parts.map((p) => p.confidence).filter((c): c is number => c !== null);
  return {
    text,
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    source: parts[0]!.source,
    confidence: confs.length ? Math.min(...confs) : null,
    vertical: false,
    parts,
  };
}

/**
 * Merges horizontal text fragments that sit on the same baseline and close together into lines.
 * PDF text often arrives in pieces ("5.40", "x", "4.10") and OCR returns single words.
 * Vertical text (dimension labels along a wall) is kept as it is.
 */
export function mergeLines(items: readonly TextItem[]): TextLine[] {
  const horizontal = items.filter((i) => !i.vertical && i.text.trim()).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows: { cy: number; h: number; items: TextItem[] }[] = [];
  for (const item of horizontal) {
    const cy = item.y + item.h / 2;
    const row = rows.find(
      (r) => Math.abs(r.cy - cy) < Math.min(r.h, item.h) * 0.5 && Math.max(r.h, item.h) / Math.max(1e-6, Math.min(r.h, item.h)) < 1.8,
    );
    if (row) {
      row.items.push(item);
      row.cy = row.items.reduce((s, i) => s + i.y + i.h / 2, 0) / row.items.length;
    } else rows.push({ cy, h: item.h, items: [item] });
  }

  const lines: TextLine[] = [];
  for (const row of rows) {
    const sorted = row.items.sort((a, b) => a.x - b.x);
    let current: TextItem[] = [];
    for (const item of sorted) {
      const prev = current[current.length - 1];
      if (prev) {
        const gap = item.x - (prev.x + prev.w);
        const h = Math.min(prev.h, item.h);
        if (gap > h * 1.2 || gap < -h * 0.3) {
          lines.push(join(current));
          current = [];
        }
      }
      current.push(item);
    }
    if (current.length) lines.push(join(current));
  }

  const vertical = items.filter((i) => i.vertical && i.text.trim()).map((i) => ({ ...i, text: i.text.trim(), parts: [i] }));
  return [...lines, ...vertical];
}
