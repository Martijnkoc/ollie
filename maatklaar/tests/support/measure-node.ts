import { createWorker, PSM, type Worker } from "tesseract.js";
import path from "node:path";
import { ocrBlocksToText, type OcrBlocks } from "@/lib/documents/ocr-words";
import { analyzeText, type AnalysisResult } from "@/lib/plan-analysis/analyze";
import { finishAutoMeasure, measureGeometry, type AutoMeasureResult } from "@/lib/plan-analysis/auto-measure";
import { cropForOcr, readDimensionText, type DimensionReading, type Raster } from "@/lib/plan-analysis/dimensions";
import { flattenBackground } from "@/lib/plan-analysis/raster";
import { encodePng } from "./png";

/**
 * The browser pipeline, run in Node with the same local OCR engine and language data: page OCR on a
 * flattened image, text analysis, walls and dimension lines, label OCR, consensus and rooms.
 * Used by the tests and by the validation harness (npm run validate).
 */
export async function createOcr(): Promise<Worker> {
  return createWorker("nld", 1, {
    langPath: path.resolve(import.meta.dirname, "../../node_modules/@tesseract.js-data/nld/4.0.0_best_int"),
    cacheMethod: "none",
    gzip: true,
  });
}

export async function readLabels(worker: Worker, page: Raster, lines: NonNullable<ReturnType<typeof measureGeometry>>["lines"]) {
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: "0123456789.,cm ",
    user_defined_dpi: "300",
  });
  const readings: DimensionReading[] = [];
  for (const line of lines) {
    for (const turn of line.axis === "h" ? ([0] as const) : ([90, 270] as const)) {
      const crop = cropForOcr(page, line.label, turn);
      const value = readDimensionText((await worker.recognize(encodePng(crop))).data.text, crop);
      if (value) {
        readings.push({ ...line, ...value });
        break;
      }
    }
  }
  return readings;
}

export async function measurePlan(worker: Worker, page: Raster): Promise<{ text: AnalysisResult; auto: AutoMeasureResult | null }> {
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1", tessedit_char_whitelist: "" });
  const flat = { data: flattenBackground(page.data, page.w, page.h), w: page.w, h: page.h };
  const ocr = await worker.recognize(encodePng(flat), {}, { blocks: true });
  const text = analyzeText(ocrBlocksToText(ocr.data.blocks as unknown as OcrBlocks, 1), {
    method: "ocr",
    imageWidthPx: page.w,
    minImageWidthPx: 800,
  });
  const geo = measureGeometry(page.data, page.w, page.h);
  if (!geo) return { text, auto: null };
  const readings = await readLabels(worker, page, geo.lines);
  const labels = text.rooms.map((r) => ({ name: r.name, x: r.box.x + r.box.w / 2, y: r.box.y + r.box.h / 2, h: r.box.h }));
  return { text, auto: finishAutoMeasure(geo, readings, labels, 1) };
}
