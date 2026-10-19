"use client";

import { LIMITS } from "@/config/site";
import { analyzeText, type AnalysisResult } from "@/lib/plan-analysis/analyze";
import type { PlanDocument } from "@/lib/projects/schema";
import { recognizeCanvas } from "./ocr";
import { openPdf, pageText, renderPage, scaleForTarget, PdfOpenError, type PdfPage } from "./pdf";
import type { FileKind } from "./sniff";
import { checkUpload } from "./validate";

type PdfDocument = Awaited<ReturnType<typeof openPdf>>;
const pdfCache = new WeakMap<Blob, Promise<PdfDocument>>();

function pdfFor(blob: Blob) {
  let p = pdfCache.get(blob);
  if (!p) {
    p = blob.arrayBuffer().then((b) => openPdf(new Uint8Array(b)));
    pdfCache.set(blob, p);
    p.catch(() => pdfCache.delete(blob));
  }
  return p;
}

export type Inspection = { ok: true; kind: FileKind; pages: PlanDocument["pages"]; notes: string[] } | { ok: false; error: string };

/** Validates a chosen file and reads its pages, entirely in the browser. */
export async function inspectFile(file: File): Promise<Inspection> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkUpload({ type: file.type, size: file.size }, bytes);
  if (!check.ok) return check;
  const notes = [...check.notes];
  if (check.kind === "pdf") {
    let pdf: PdfDocument;
    try {
      pdf = await pdfFor(file);
    } catch (err) {
      return { ok: false, error: err instanceof PdfOpenError ? err.message : "Deze PDF kunnen we niet openen." };
    }
    if (pdf.numPages > LIMITS.maxPdfPages) {
      return {
        ok: false,
        error: `Deze PDF heeft ${pdf.numPages} pagina's; we lezen er maximaal ${LIMITS.maxPdfPages}. Bewaar alleen de pagina's met plattegronden als nieuwe PDF.`,
      };
    }
    const pages: PlanDocument["pages"] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const vp = (await pdf.getPage(i)).getViewport({ scale: 1 });
      pages.push({ index: i - 1, width: vp.width, height: vp.height, unit: "pt", label: pdf.numPages > 1 ? `Pagina ${i}` : "Plattegrond" });
    }
    return { ok: true, kind: "pdf", pages, notes };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const page = { index: 0, width: bitmap.width, height: bitmap.height, unit: "px" as const, label: "Plattegrond" };
    bitmap.close();
    return { ok: true, kind: check.kind, pages: [page], notes };
  } catch {
    return { ok: false, error: "Deze afbeelding kunnen we niet openen. Het bestand is mogelijk beschadigd." };
  }
}

/** Renders one page into a canvas whose long side is about `targetPx`. Returns pixels per page unit. */
export async function renderPageCanvas(
  blob: Blob,
  kind: FileKind,
  pageIndex: number,
  targetPx: number,
): Promise<{ canvas: HTMLCanvasElement; pxPerUnit: number }> {
  if (kind === "pdf") {
    const pdf = await pdfFor(blob);
    const page: PdfPage = await pdf.getPage(pageIndex + 1);
    const vp = page.getViewport({ scale: 1 });
    const scale = scaleForTarget(vp.width, vp.height, targetPx);
    return { canvas: await renderPage(page, scale), pxPerUnit: scale };
  }
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(2, Math.max(0.25, targetPx / Math.max(bitmap.width, bitmap.height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { canvas, pxPerUnit: scale };
}

export type AnalysisStage = { stage: "tekst" | "ocr" | "herkennen"; fraction?: number };

/**
 * Analysis of one page: embedded PDF text first; if a page has (almost) no text it is a scan and we run
 * local OCR on a high-resolution render. Then the same recognition rules run on whatever text was found.
 */
export async function analyzePage(
  blob: Blob,
  doc: PlanDocument,
  pageIndex: number,
  onStage: (s: AnalysisStage) => void,
): Promise<AnalysisResult> {
  const page = doc.pages[pageIndex]!;
  if (doc.kind === "pdf") {
    onStage({ stage: "tekst" });
    const pdf = await pdfFor(blob);
    const items = await pageText(await pdf.getPage(pageIndex + 1));
    if (items.length >= 3) {
      onStage({ stage: "herkennen" });
      return analyzeText(items, { method: "pdf-tekst", imageWidthPx: null, minImageWidthPx: LIMITS.minImageWidthPx });
    }
  }
  onStage({ stage: "ocr", fraction: 0 });
  const { canvas, pxPerUnit } = await renderPageCanvas(blob, doc.kind, pageIndex, 3000);
  const items = await recognizeCanvas(canvas, pxPerUnit, (fraction) => onStage({ stage: "ocr", fraction }));
  onStage({ stage: "herkennen" });
  return analyzeText(items, {
    method: "ocr",
    imageWidthPx: page.unit === "px" ? page.width : null,
    minImageWidthPx: LIMITS.minImageWidthPx,
  });
}
