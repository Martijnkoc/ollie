import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Worker } from "tesseract.js";
import { applyAnalysis } from "@/lib/plan-analysis/apply";
import { measureGeometry } from "@/lib/plan-analysis/auto-measure";
import { computeProject } from "@/lib/projects/compute";
import { newProject } from "@/lib/projects/factory";
import { fixture } from "./support/pdf";
import { createOcr, measurePlan } from "./support/measure-node";
import { decodePng } from "./support/png";

/**
 * The whole automatic measuring chain on a fictional makelaarsplattegrond (fixtures/plattegrond-wanden.png,
 * drawn at 130 px per metre by scripts/make-fixtures.mjs). The drawing has only room names: every size
 * below comes from the walls and the dimension lines. Same local OCR engine as the browser.
 */
const PX_PER_M = 130;
const TRUTH_M2: Record<string, number> = { Woonkamer: 29.44, Keuken: 3.75, Hal: 5.4, Badkamer: 5.4, Slaapkamer: 4.86 };

const page = decodePng(fixture("plattegrond-wanden.png"));
let worker: Worker;

beforeAll(async () => {
  worker = await createOcr();
}, 120_000);

afterAll(async () => {
  await worker?.terminate();
});

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
    // The same chain as the browser: page OCR for the names, walls, dimension lines, label OCR, consensus.
    const { text, auto: measured } = await measurePlan(worker, page);
    expect(text.rooms.map((r) => r.name).sort()).toEqual(Object.keys(TRUTH_M2).sort());
    const auto = measured!;
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
