import { describe, expect, it } from "vitest";
import { applyCameraToWindow, CAMERA_TASKS, cameraResults, measureShot, tasksFor, type CameraShot } from "@/lib/measurements/camera";
import { evaluateWindow } from "@/lib/measurements/evaluate";
import { project, type Marked, type Pt } from "@/lib/measurements/photo";
import { defaultRuleFor } from "@/lib/measurements/protocols";
import { newProject, newWindow } from "@/lib/projects/factory";
import { computeProject, windowOrder } from "@/lib/projects/compute";
import { buildReportModel, lowerBound } from "@/lib/reports/model";
import { buildCsv } from "@/lib/reports/csv";

/** A wall seen from the front at about 2 px per mm: A4 sheet beside a 1200 × 1500 mm opening. */
const H = [2.1, 0.3, 310, -0.15, 2.35, 120, 0.00006, 0.00003, 1];
const at = (x: number, y: number, sigma = 0.3): Marked => ({ ...project(H, { x, y }), sigma });
const rect = (x0: number, y0: number, x1: number, y1: number) => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)];
const sheet = rect(1400, 500, 1610, 797);

function shot(task: CameraShot["task"], points: Marked[], nudge: Pt = { x: 0, y: 0 }): CameraShot {
  const moved = points.map((p) => ({ ...p, x: p.x + nudge.x, y: p.y + nudge.y }));
  const r = measureShot(CAMERA_TASKS[task], { reference: sheet, points: moved, orientation: "auto" });
  if (!r.ok) throw new Error(r.reason);
  return {
    id: `shot${task}${nudge.x}`.replace(/[^a-z0-9]/g, "").slice(0, 20),
    task,
    takenAt: "2026-10-19T12:00:00Z",
    width: 4000,
    height: 3000,
    orientation: "auto",
    reference: sheet,
    points: moved,
    snapped: [],
    values: r.values,
    capture: { method: "upload", device: "desktop", browser: "test" },
    photoChecks: [],
    processed: true,
    quality: { status: "ok", issues: [] },
  };
}

describe("meten met de camera in plaats van een rolmaat", () => {
  it("kiest per meetregel de foto's die nodig zijn", () => {
    expect(tasksFor(defaultRuleFor("rolgordijn", "in-de-dag")).map((t) => t.id)).toEqual(["opening", "diepte"]);
    expect(tasksFor(defaultRuleFor("rolgordijn", "op-de-dag")).map((t) => t.id)).toEqual(["opening", "gewenst", "ruimte_boven"]);
    expect(tasksFor(defaultRuleFor("gordijn", "wand")).map((t) => t.id)).toEqual(["opening", "ruimte_boven", "rail", "ophang"]);
    expect(tasksFor(defaultRuleFor("rolluik", "voorzet")).map((t) => t.id)).toEqual(["opening", "ruimte_boven", "diepte"]);
  });

  it("vult de maten van een raam met hun foutmarge, en een getypte maat blijft staan", () => {
    const rule = defaultRuleFor("rolgordijn", "in-de-dag");
    let w = newWindow([], { product: "rolgordijn", mounting: "in-de-dag", ruleId: rule.id });
    w = { ...w, measures: { diepte: 95 }, camera: [shot("opening", rect(0, 0, 1200, 1500))] };
    w = applyCameraToWindow(w, rule);
    expect(w.measures).toMatchObject({ breedte_boven: 1200, breedte_midden: 1200, breedte_onder: 1200, hoogte_links: 1500, diepte: 95 });
    expect(w.sources.breedte_boven).toMatchObject({ method: "camera", shots: 1 });
    expect(w.sources.diepte).toBeUndefined();
    expect(w.sources.breedte_boven!.uncertaintyMm).toBeGreaterThanOrEqual(6);

    // The evaluation knows which values came from the camera and does not call camera noise an uneven opening.
    const e = evaluateWindow(
      { ...w, confirmed: true, checks: { grepen: false, ventilatierooster: false, raam_openen: false, vensterbank: false } },
      rule,
    );
    expect(e.missing).toEqual([]);
    expect(e.status).toBe("bevestigd");
    expect(e.camera?.keys).toHaveLength(6);
    expect(e.warnings.some((x) => x.includes("met de camera gemeten"))).toBe(true);
    expect(e.warnings.some((x) => x.includes("ondergrens"))).toBe(true);
    const checks = { grepen: false, ventilatierooster: false, raam_openen: false, vensterbank: false, tegels: false };
    expect(windowOrder({ ...w, confirmed: true, checks }, rule).status).toBe("measuring_sheet");
  });

  it("twee foto's die het eens zijn worden gecombineerd; als ze verschillen, wordt niets ingevuld", () => {
    const rule = defaultRuleFor("rolgordijn", "in-de-dag");
    const two = [shot("opening", rect(0, 0, 1200, 1500)), shot("opening", rect(0, 0, 1200, 1500), { x: 0.4, y: -0.3 })];
    const ok = cameraResults(two).find((r) => r.target === "breedte_boven")!;
    expect(ok).toMatchObject({ shots: 2, agree: true, usable: true });

    const off = [shot("opening", rect(0, 0, 1200, 1500)), shot("opening", rect(0, 0, 1260, 1500))];
    const bad = cameraResults(off).find((r) => r.target === "breedte_boven")!;
    expect(bad.usable).toBe(false);
    const w = applyCameraToWindow({ ...newWindow([]), camera: off }, rule);
    expect(w.measures.breedte_boven).toBeUndefined();
    // Heights agree in both photos and are still filled in.
    expect(w.measures.hoogte_links).toBe(1500);
  });

  it("meet de plafondhoogte en de ophanghoogtes als losse lijnen", () => {
    const ceiling = shot("plafond", [at(1500, 2600), at(1500, 0)]);
    expect(ceiling.values.plafondhoogte!.mm).toBeCloseTo(2600, 0);
    const hang = shot("ophang", [at(100, 0), at(100, 2480), at(700, 0), at(700, 2475), at(1300, 0), at(1300, 2470)]);
    expect(hang.values.ophanghoogte_links!.mm).toBeCloseTo(2480, 0);
    expect(hang.values.ophanghoogte_rechts!.mm).toBeCloseTo(2470, 0);
  });

  it("verwijdert cameramaten als hun foto's weg zijn", () => {
    const rule = defaultRuleFor("rolgordijn", "in-de-dag");
    const filled = applyCameraToWindow({ ...newWindow([]), camera: [shot("opening", rect(0, 0, 1200, 1500))] }, rule);
    const emptied = applyCameraToWindow({ ...filled, camera: [] }, rule);
    expect(emptied.measures).toEqual({});
    expect(emptied.sources).toEqual({});
  });

  it("rapport en CSV noemen de bron, de foutmarge en de ondergrens", () => {
    const rule = defaultRuleFor("rolgordijn", "in-de-dag");
    const p = newProject();
    const w = applyCameraToWindow(
      {
        ...newWindow([], { product: "rolgordijn", mounting: "in-de-dag", ruleId: rule.id }),
        camera: [shot("opening", rect(0, 0, 1200, 1500))],
      },
      rule,
    );
    const proj = { ...p, windows: [w] };
    const c = computeProject(proj);
    const model = buildReportModel(proj, c, { now: new Date("2026-10-19T12:00:00Z") });
    const card = model.windows.cards[0]!;
    const width = card.rows.find((r) => r.label === "Breedte boven")!;
    expect(width.value).toMatch(/1200 mm ± \d+ mm \(bron: browser_scan_estimate ±\d+ mm, 1 foto\)/);
    expect(card.rows.find((r) => r.label === "Ondergrens breedte")!.value).toMatch(/^11\d\d mm/);
    const keys = ["breedte_boven", "breedte_onder"] as const;
    expect(lowerBound(keys, w.measures, w.sources)).toBe(Math.min(...keys.map((k) => w.measures[k]! - w.sources[k]!.uncertaintyMm)));
    expect(buildCsv(c, { demo: false })).toMatch(/camera ±\d+ mm \(1 foto\)/);
  });
});
