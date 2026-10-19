import type { TextItem } from "@/lib/plan-analysis/types";

type Bbox = { x0: number; y0: number; x1: number; y1: number };
export type OcrBlocks = { paragraphs: { lines: { words: { text: string; confidence: number; bbox: Bbox }[] }[] }[] }[];

/**
 * Flattens Tesseract block output into page-unit text items. `pxPerUnit` is the render scale used for OCR,
 * so boxes line up with the plan overlay. Text is treated as plain data; it is never rendered as HTML.
 */
export function ocrBlocksToText(blocks: OcrBlocks | null, pxPerUnit: number): TextItem[] {
  const out: TextItem[] = [];
  for (const block of blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const word of line.words) {
          const text = word.text.replace(/\s+/g, " ").trim();
          if (!text) continue;
          const { x0, y0, x1, y1 } = word.bbox;
          out.push({
            text,
            x: x0 / pxPerUnit,
            y: y0 / pxPerUnit,
            w: (x1 - x0) / pxPerUnit,
            h: (y1 - y0) / pxPerUnit,
            source: "ocr",
            confidence: word.confidence,
            vertical: false,
          });
        }
      }
    }
  }
  return out;
}
