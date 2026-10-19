import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { ocrBlocksToText, type OcrBlocks } from "@/lib/documents/ocr-words";
import { analyzeText } from "@/lib/plan-analysis/analyze";
import { FIXTURES } from "./support/pdf";

/**
 * Runs the same local Tesseract engine and Dutch language data as the browser, on synthetic scans.
 * No network: language data comes from node_modules.
 */
let worker: Worker;

beforeAll(async () => {
  worker = await createWorker("nld", 1, {
    langPath: path.resolve(import.meta.dirname, "../node_modules/@tesseract.js-data/nld/4.0.0_best_int"),
    cacheMethod: "none",
    gzip: true,
  });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
}, 120_000);

afterAll(async () => {
  await worker?.terminate();
});

async function ocr(name: string) {
  const result = await worker.recognize(path.join(FIXTURES, name), {}, { blocks: true });
  return ocrBlocksToText(result.data.blocks as unknown as OcrBlocks, 1);
}

describe("lokale OCR op een gescande plattegrond", () => {
  it("leest kamernamen en duidelijke maten uit een heldere scan", async () => {
    const items = await ocr("scan-helder.png");
    const r = analyzeText(items, { method: "ocr", imageWidthPx: 1600, minImageWidthPx: 800 });
    const names = r.rooms.map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(["Woonkamer", "Slaapkamer", "Badkamer", "Keuken"]));
    const keuken = r.rooms.find((x) => x.name === "Keuken")!;
    expect(keuken.dims).toMatchObject({ lengthMm: 3000, widthMm: 4000 });
    expect(r.meanConfidence).toBeGreaterThan(70);
  }, 120_000);

  it("neemt onduidelijke of ontbrekende maten niet over uit een vage scan", async () => {
    const items = await ocr("scan-onduidelijk.png");
    const r = analyzeText(items, { method: "ocr", imageWidthPx: 1600, minImageWidthPx: 800 });
    const woonkamer = r.rooms.find((x) => x.name === "Woonkamer");
    const badkamer = r.rooms.find((x) => x.name === "Badkamer");
    // The label reads "6.0? x 8.0?"; Tesseract tends to turn that into something like "6.07 x 8.0?" with low
    // confidence. That must never become a measurement.
    expect(woonkamer).toBeDefined();
    expect(woonkamer!.dims).toBeNull();
    expect(woonkamer!.notes.join(" ")).toMatch(/onzeker gelezen|niet eenduidig/);
    // The badkamer has no measurement label at all: nothing is filled in.
    expect(badkamer).toBeDefined();
    expect(badkamer!.dims).toBeNull();
    // A clearly readable label next to it is still used.
    expect(r.rooms.find((x) => x.name === "Keuken")!.dims).toMatchObject({ lengthMm: 3000, widthMm: 4000 });
  }, 120_000);
});
