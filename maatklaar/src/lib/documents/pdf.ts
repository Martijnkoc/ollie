"use client";

import { LIMITS } from "@/config/site";
import type { TextItem } from "@/lib/plan-analysis/types";
import { pdfItemsToText, type PdfJsTextItem } from "./pdf-text";

// The legacy build targets the browsers we support (the modern build needs brand-new APIs such as
// Map.prototype.getOrInsertComputed and breaks rendering in current Chrome and Safari releases).
type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfDocument = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;
export type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

let pdfjsPromise: Promise<PdfJs> | null = null;

/** Loads PDF.js on demand with the self-hosted worker; nothing is fetched from another origin. */
function loadPdfJs() {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
    return pdfjs;
  });
  return pdfjsPromise;
}

export class PdfOpenError extends Error {}

export async function openPdf(bytes: Uint8Array): Promise<PdfDocument> {
  const pdfjs = await loadPdfJs();
  try {
    // PDF.js takes ownership of the buffer; give it a copy so the original stays usable.
    const task = pdfjs.getDocument({
      data: bytes.slice(),
      cMapUrl: "/vendor/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
      wasmUrl: "/vendor/pdfjs/wasm/",
      iccUrl: "/vendor/pdfjs/iccs/",
      enableXfa: false,
      maxImageSize: LIMITS.maxImagePixels,
      stopAtErrors: false,
    });
    return await task.promise;
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "PasswordException")
      throw new PdfOpenError("Deze PDF is beveiligd met een wachtwoord. Sla hem op zonder wachtwoord en probeer het opnieuw.");
    throw new PdfOpenError("Deze PDF kunnen we niet openen. Het bestand is mogelijk beschadigd of geen echte PDF.");
  }
}

export async function pageText(page: PdfPage): Promise<TextItem[]> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = content.items.filter((i): i is PdfJsTextItem & (typeof content.items)[number] => "str" in i);
  return pdfItemsToText(items, viewport.transform);
}

/** Renders a page at `scale` (page units → pixels) into a new canvas. */
export async function renderPage(page: PdfPage, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas niet beschikbaar");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport }).promise;
  return canvas;
}

/** Picks a render scale so the long side is about `targetPx` pixels, within the browser's canvas limits. */
export function scaleForTarget(width: number, height: number, targetPx: number) {
  return Math.min(8, Math.max(0.5, targetPx / Math.max(width, height)));
}
