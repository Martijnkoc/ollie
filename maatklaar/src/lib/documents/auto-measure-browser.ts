"use client";

import type { AnalysisResult } from "@/lib/plan-analysis/analyze";
import type { AutoMeasureResult } from "@/lib/plan-analysis/auto-measure";
import { matchRoomName } from "@/lib/plan-analysis/classify";
import { cropForOcr, readDimensionText, type DimensionLine, type DimensionReading, type Raster } from "@/lib/plan-analysis/dimensions";
import type { PlacedLabel } from "@/lib/plan-analysis/rooms-auto";
import { center, type TextItem } from "@/lib/plan-analysis/types";
import type { PlanDocument } from "@/lib/projects/schema";
import type { WorkerRequest } from "./auto-measure.worker";
import { recognizeLabels } from "./ocr";
import type { FileKind } from "./sniff";

type Render = (blob: Blob, kind: FileKind, page: number, targetPx: number) => Promise<{ canvas: HTMLCanvasElement; pxPerUnit: number }>;

const NO_WALLS =
  "We konden geen getekende wanden herkennen. Dat lukt bij plattegronden met gevulde (donkere) muren; bij tekeningen met alleen lijnen teken je de ruimtes na of vul je de maten in.";

function call<T>(worker: Worker, message: WorkerRequest, transfer: Transferable[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => (e.data?.type === "failed" ? reject(new Error("auto-measure failed")) : resolve(e.data as T));
    worker.onerror = () => reject(new Error("auto-measure worker error"));
    worker.postMessage(message, transfer);
  });
}

function toCanvas(r: Raster) {
  const canvas = document.createElement("canvas");
  canvas.width = r.w;
  canvas.height = r.h;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.w, r.h), 0, 0);
  return canvas;
}

/** Values of dimension lines from the PDF's own text: the text items inside each label box. */
function readFromPdfText(lines: DimensionLine[], items: readonly TextItem[], pxPerUnit: number): DimensionReading[] {
  const out: DimensionReading[] = [];
  for (const line of lines) {
    const b = line.label;
    const inBox = items
      .filter((i) => {
        const c = center(i);
        const x = c.x * pxPerUnit;
        const y = c.y * pxPerUnit;
        return x >= b.x0 - 3 && x <= b.x1 + 3 && y >= b.y0 - 3 && y <= b.y1 + 3;
      })
      .sort((p, q) => (line.axis === "h" ? p.x - q.x : q.y - p.y));
    const value = readDimensionText(inBox.map((i) => i.text).join(""));
    if (value) out.push({ ...line, ...value });
  }
  return out;
}

/** Values of dimension lines by local OCR of each label, turned upright first. */
async function readByOcr(lines: DimensionLine[], page: Raster): Promise<DimensionReading[]> {
  const out: DimensionReading[] = [];
  // Horizontal labels read as they are; vertical ones usually bottom-to-top (a quarter turn clockwise),
  // and if that reads nothing, top-to-bottom.
  const first = lines.map((l) => cropForOcr(page, l.label, l.axis === "h" ? 0 : 90));
  const texts = await recognizeLabels(first.map(toCanvas));
  const retry: number[] = [];
  lines.forEach((line, i) => {
    const value = readDimensionText(texts[i] ?? "", first[i]);
    if (value) out.push({ ...line, ...value });
    else if (line.axis === "v") retry.push(i);
  });
  const second = retry.map((i) => cropForOcr(page, lines[i]!.label, 270));
  const again = await recognizeLabels(second.map(toCanvas));
  retry.forEach((i, j) => {
    const value = readDimensionText(again[j] ?? "", second[j]);
    if (value) out.push({ ...lines[i]!, ...value });
  });
  return out;
}

/**
 * Page OCR skips single letters, and small cupboards are often marked with just "K" or "MK". Reads the
 * inside of each small unnamed space once more on its own; a recognised room term names the space.
 */
async function nameSmallSpaces(result: AutoMeasureResult, page: Raster, pxPerUnit: number): Promise<AutoMeasureResult> {
  const small = result.rooms.filter((r) => !r.names.length && r.areaMm2 !== null && r.areaMm2 < 4e6);
  if (!small.length) return result;
  const crops = small.map((r) => {
    const xs = r.polygon.map((p) => p.x * pxPerUnit);
    const ys = r.polygon.map((p) => p.y * pxPerUnit);
    const box = {
      x0: Math.ceil(Math.min(...xs)) + 2,
      y0: Math.ceil(Math.min(...ys)) + 2,
      x1: Math.floor(Math.max(...xs)) - 3,
      y1: Math.floor(Math.max(...ys)) - 3,
    };
    return cropForOcr(page, box, 0, 3);
  });
  const texts = await recognizeLabels(crops.map(toCanvas), "naam");
  small.forEach((room, i) => {
    const name = (texts[i] ?? "")
      .split(/\n+/)
      // Door ticks next to a lone letter come out as "-K" or "7K": keep the letters only.
      .map((line) => matchRoomName(line.replace(/[^\p{L}\s]/gu, "").trim()))
      .find(Boolean)?.name;
    if (!name) return;
    room.names = [name];
    room.ok = room.okIfNamed;
    room.notes = room.notes.filter((n) => !n.startsWith("Geen naam gevonden"));
  });
  return result;
}

/**
 * Measures rooms, openings and the scale of one page from the drawing itself. Renders the page, finds
 * walls and dimension lines in a worker, reads the dimension values (PDF text or local OCR) and lets the
 * worker build the rooms. Returns null when something unexpected fails: the text analysis still stands.
 */
export async function autoMeasurePage(
  blob: Blob,
  doc: PlanDocument,
  pageIndex: number,
  text: AnalysisResult,
  pdfItems: readonly TextItem[] | null,
  render: Render,
  onStage: (stage: "wanden" | "maatlijnen") => void,
): Promise<AutoMeasureResult | null> {
  const page = doc.pages[pageIndex]!;
  // Enough pixels for thin inner walls and small labels, few enough to stay quick on a phone.
  const target = doc.kind === "pdf" ? 2400 : Math.min(2400, Math.max(1400, Math.max(page.width, page.height)));
  let worker: Worker | null = null;
  try {
    onStage("wanden");
    const { canvas, pxPerUnit } = await render(blob, doc.kind, pageIndex, target);
    const image = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    const raster: Raster = { data: image.data, w: image.width, h: image.height };
    worker = new Worker(new URL("./auto-measure.worker.ts", import.meta.url), { type: "module" });
    const copy = new Uint8ClampedArray(image.data);
    const prepared = await call<{ lines: DimensionLine[] | null }>(
      worker,
      { type: "prepare", rgba: copy, w: image.width, h: image.height },
      [copy.buffer],
    );
    if (!prepared.lines) return { scale: null, rooms: [], openings: [], reasons: [NO_WALLS] };

    onStage("maatlijnen");
    const readings = pdfItems?.length ? readFromPdfText(prepared.lines, pdfItems, pxPerUnit) : await readByOcr(prepared.lines, raster);
    const labels: PlacedLabel[] = text.rooms.map((r) => {
      const c = center(r.box);
      return { name: r.name, x: c.x * pxPerUnit, y: c.y * pxPerUnit, h: r.box.h * pxPerUnit };
    });
    const finished = await call<{ result: AutoMeasureResult }>(worker, { type: "finish", readings, labels, pxPerUnit });
    return await nameSmallSpaces(finished.result, raster, pxPerUnit);
  } catch {
    return null;
  } finally {
    worker?.terminate();
  }
}
