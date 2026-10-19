import { readFileSync } from "node:fs";
import path from "node:path";
import { pdfItemsToText, type PdfJsTextItem } from "@/lib/documents/pdf-text";

export const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");
export const fixture = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, name)));

/** Opens a PDF with the same PDF.js build the browser uses (legacy build for Node). */
export async function openFixturePdf(name: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs.getDocument({
    data: fixture(name),
    standardFontDataUrl: path.resolve(import.meta.dirname, "../../node_modules/pdfjs-dist/standard_fonts/") + "/",
  }).promise;
}

export async function fixturePageText(name: string, pageNumber = 1) {
  const doc = await openFixturePdf(name);
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = content.items.filter((i) => "str" in i) as unknown as PdfJsTextItem[];
  return { doc, page, viewport, items: pdfItemsToText(items, viewport.transform) };
}
