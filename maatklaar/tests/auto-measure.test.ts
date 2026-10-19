import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { ocrBlocksToText, type OcrBlocks } from "@/lib/documents/ocr-words";
import { analyzeText } from "@/lib/plan-analysis/analyze";
import { applyAnalysis } from "@/lib/plan-analysis/apply";
import { finishAutoMeasure, measureGeometry } from "@/lib/plan-analysis/auto-measure";
import { cropForOcr, readDimensionText, type DimensionReading } from "@/lib/plan-analysis/dimensions";
import { flattenBackground } from "@/lib/plan-analysis/raster";
import { computeProject } from "@/lib/projects/compute";
import { newProject } from "@/lib/projects/factory";
import { fixture } from "./support/pdf";
import { decodePng, encodePng } from "./support/png";

/**
 * The whole automatic measuring chain on a fictional makelaarsplattegrond (fixtures/plattegrond-wanden.png,
 * drawn at 130 px per metre by scripts/make-fixtures.mjs). The drawing has only room names: every size
 * below comes from the walls and the dimension lines. Same local OCR engine as the browser.
 */
const PX_PER_M = 130;
const TRUTH_M2: Record<string, number> = { Woonkamer: 29.44, Keuken: 3.75, Hal: 5.4, Badkamer: 5.4, Slaapkamer: 4.86 };

const page = decodePng(fixture("plattegrond-wanden.png"));
const langPath = path.resolve(import.meta.dirname, "../node_modules/@tesseract.js-data/nld/4.0.0_best_int");
let worker: Worker;

beforeAll(async () => {
  worker = await createWorker("nld", 1, { langPath, cacheMethod: "none", gzip: true });
}, 120_000);

afterAll(async () => {
  await worker?.terminate();
});

async function readLabels(lines: NonNullable<ReturnType<typeof measureGeometry>>["lines"]) {
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: "0123456789.,cm ",
    user_defined_dpi: "300",
  });
  const readings: DimensionReading[] = [];
  for (const line of lines) {
    for (const turn of line.axis === "h" ? ([0] as const) : ([90, 270] as const)) {
      const crop = cropForOcr(page, line.label, turn);
      const text = (await worker.recognize(encodePng(crop))).data.text;
      const value = readDimensionText(text, crop);
      if (value) {
        readings.push({ ...line, ...value });
        break;
      }
    }
  }
  return readings;
}

describe("automatisch opmeten van een makelaarsplattegrond", () => {
  const geo = measureGeometry(page.data, page.w, page.h)!;

  it("herkent gevulde wanden met hun dikte en negeert meubels, kookplaat en tv", () => {
    expect(geo).not.toBeNull();
    // 100 mm and 300 mm at 130 px/m.
    expect(geo.model.thin).toBeGreaterThanOrEqual(12);
    expect(geo.model.thin).toBeLessThanOrEqual(14);
    expect(geo.model.thick).toBeGreaterThanOrEqual(38);
    expect(geo.model.thick).toBeLessThanOrEqual(40);
    // The black cooktop touches the outer wall at x = 6000 mm; it must not become wall.
    const cx = Math.round(270 + 5700 * 0.13);
    const cy = Math.round(250 + 5300 * 0.13);
    expect(geo.model.wall.data[cy * page.w + cx]).toBe(0);
  });

  it("vindt de maatlijnen met hun lengte tussen de streepjes", () => {
    expect(geo.lines).toHaveLength(13);
    const spans = geo.lines.map((l) => Math.round(((l.to - l.from) / PX_PER_M) * 100) / 100).sort((a, b) => a - b);
    expect(spans).toEqual([1.5, 1.8, 2, 2, 2.5, 2.7, 2.7, 3.4, 4, 5.6, 6, 6, 8.4]);
  });

  it("meet alle ruimtes uit de tekening, met een bewezen schaal", async () => {
    // Room names come from the page OCR, exactly as in the browser.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1", tessedit_char_whitelist: "" });
    const flat = { data: flattenBackground(page.data, page.w, page.h), w: page.w, h: page.h };
    const ocr = await worker.recognize(encodePng(flat), {}, { blocks: true });
    const text = analyzeText(ocrBlocksToText(ocr.data.blocks as unknown as OcrBlocks, 1), {
      method: "ocr",
      imageWidthPx: page.w,
      minImageWidthPx: 800,
    });
    expect(text.rooms.map((r) => r.name).sort()).toEqual(Object.keys(TRUTH_M2).sort());

    const readings = await readLabels(geo.lines);
    expect(readings.length).toBeGreaterThanOrEqual(11);
    const labels = text.rooms.map((r) => ({ name: r.name, x: r.box.x + r.box.w / 2, y: r.box.y + r.box.h / 2, h: r.box.h }));
    const auto = finishAutoMeasure(geo, readings, labels, 1);

    expect(auto.scale?.proven).toBe(true);
    expect(auto.scale?.directions).toBe(2);
    expect(Math.abs(1000 / auto.scale!.mmPerUnit - PX_PER_M) / PX_PER_M).toBeLessThan(0.005);

    expect(auto.rooms).toHaveLength(5);
    for (const room of auto.rooms) {
      const truth = TRUTH_M2[room.names[0]!]!;
      expect(Math.abs(room.areaMm2! / 1e6 - truth) / truth, room.names[0]).toBeLessThan(0.01);
      expect(room.ok, room.names[0]).toBe(true);
    }
    // The L-shaped living room keeps its six corners.
    expect(auto.rooms.find((r) => r.names[0] === "Woonkamer")!.polygon).toHaveLength(6);

    const windows = auto.openings.filter((o) => o.kind === "raam").map((o) => Math.round(o.widthMm! / 100) * 100);
    expect(windows.sort((a, b) => a - b)).toEqual([1000, 1000, 1100, 1200, 1400, 1600, 2200]);
    expect(auto.openings.filter((o) => o.kind === "deur")).toHaveLength(5);

    // Into a project: rooms, scale and window register, then the free floor calculation.
    const project = applyAnalysis(newProject(), 0, { ...text, auto });
    expect(project.scales[0]).toMatchObject({ method: "maatlijnen", status: "auto" });
    expect(project.windows).toHaveLength(7);
    expect(project.windows.every((w) => w.planWidthMm && Object.keys(w.measures).length === 0)).toBe(true);
    const total = computeProject(project).floor.selectedNetM2;
    expect(Math.abs(total - 48.85)).toBeLessThan(0.3);
  }, 180_000);
});
