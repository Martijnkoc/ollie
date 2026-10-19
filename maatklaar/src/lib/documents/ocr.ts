"use client";

import type { TextItem } from "@/lib/plan-analysis/types";
import { ocrBlocksToText, type OcrBlocks } from "./ocr-words";

/**
 * Local OCR with Tesseract.js. Worker, engine and Dutch language data are served from /vendor on our own
 * origin; the image never leaves the device. The language data is cached by the browser after first use.
 */
export async function recognizeCanvas(
  canvas: HTMLCanvasElement,
  pxPerUnit: number,
  onProgress?: (fraction: number) => void,
): Promise<TextItem[]> {
  const { createWorker, PSM } = await import("tesseract.js");
  const origin = window.location.origin;
  const worker = await createWorker("nld", 1, {
    workerPath: `${origin}/vendor/tesseract/worker.min.js`,
    corePath: `${origin}/vendor/tesseract/core`,
    langPath: `${origin}/vendor/tesseract/lang`,
    workerBlobURL: false,
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(m.progress);
    },
  });
  try {
    // Plans are sparse: labels scattered over a drawing, not paragraphs.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
    const result = await worker.recognize(canvas, {}, { blocks: true });
    return ocrBlocksToText(result.data.blocks as unknown as OcrBlocks, pxPerUnit);
  } finally {
    await worker.terminate();
  }
}

/**
 * Reads short labels from small, prepared images: dimension values (digits, separators, units only) or
 * the text inside one small space (a lone "K" or "MK" that page OCR skips). Same local engine and
 * language data as the page OCR.
 */
export async function recognizeLabels(images: HTMLCanvasElement[], mode: "maat" | "naam" = "maat"): Promise<string[]> {
  if (!images.length) return [];
  const { createWorker, PSM } = await import("tesseract.js");
  const origin = window.location.origin;
  const worker = await createWorker("nld", 1, {
    workerPath: `${origin}/vendor/tesseract/worker.min.js`,
    corePath: `${origin}/vendor/tesseract/core`,
    langPath: `${origin}/vendor/tesseract/lang`,
    workerBlobURL: false,
    gzip: true,
  });
  try {
    await worker.setParameters(
      mode === "maat"
        ? { tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: "0123456789.,cm ", user_defined_dpi: "300" }
        : { tessedit_pageseg_mode: PSM.SINGLE_BLOCK, tessedit_char_whitelist: "", user_defined_dpi: "300" },
    );
    const out: string[] = [];
    for (const image of images) out.push((await worker.recognize(image)).data.text.trim());
    return out;
  } finally {
    await worker.terminate();
  }
}
