import { describe, expect, it } from "vitest";
import { analyzeText } from "@/lib/plan-analysis/analyze";
import { matchRoomName, parseArea, parseDimensionPair, parseScaleNotation, parseSingleLength, isNotToScale } from "@/lib/plan-analysis/classify";
import { roomsFromAnalysis, scaleFromNotation } from "@/lib/plan-analysis/to-project";
import type { TextItem } from "@/lib/plan-analysis/types";
import { computeProject } from "@/lib/projects/compute";
import { newProject } from "@/lib/projects/factory";
import { fixturePageText } from "./support/pdf";

const ctx = { method: "pdf-tekst" as const, imageWidthPx: null, minImageWidthPx: 800 };
const item = (text: string, x: number, y: number, h = 10, confidence: number | null = null): TextItem => ({
  text,
  x,
  y,
  w: text.length * h * 0.55,
  h,
  source: confidence === null ? "pdf-tekst" : "ocr",
  confidence,
  vertical: false,
});

describe("classificatie", () => {
  it("herkent kamernamen als suggestie, ook afkortingen en nummers", () => {
    expect(matchRoomName("Woonkamer")?.name).toBe("Woonkamer");
    expect(matchRoomName("SLAAPKAMER 2")?.name).toBe("Slaapkamer 2");
    expect(matchRoomName("slpk. 1")?.name).toBe("Slaapkamer 1");
    expect(matchRoomName("WC")?.name).toBe("Toilet");
    expect(matchRoomName("Bijkeuken")?.name).toBe("Bijkeuken");
    expect(matchRoomName("Woonkamer 5.40 x 4.10")?.name).toBe("Woonkamer");
    expect(matchRoomName("De woonkamer ligt op het zuiden met uitzicht")).toBeNull();
    expect(matchRoomName("Halfsteens")).toBeNull();
  });

  it("maatlabels: eenheid alleen als die eenduidig is", () => {
    expect(parseDimensionPair("5.40 x 4.10")).toMatchObject({ lengthMm: 5400, widthMm: 4100, unit: "decimaal-meter" });
    expect(parseDimensionPair("5,4 × 4,1 m")).toMatchObject({ lengthMm: 5400, widthMm: 4100, unit: "expliciet" });
    expect(parseDimensionPair("540 x 410")).toMatchObject({ lengthMm: 5400, widthMm: 4100, unit: "plausibel" });
    expect(parseDimensionPair("5400 x 4100")).toMatchObject({ lengthMm: 5400, widthMm: 4100, unit: "plausibel" });
    // 1200 × 1100: 1,2 m (mm) and 12 m (cm) are both plausible room sizes → undecided.
    expect(parseDimensionPair("1200 x 1100")).toMatchObject({ unit: "onzeker" });
    expect(parseDimensionPair("5.40 x 410")).toBeNull();
  });

  it("oppervlakte, losse maten, schaal en 'niet op schaal'", () => {
    expect(parseArea("40,5 m²")).toEqual({ value: 40.5, text: "40,5 m²" });
    expect(parseArea("opp. 22 m2")?.value).toBe(22);
    expect(parseSingleLength("5400")).toMatchObject({ mm: 5400 });
    expect(parseSingleLength("3.45")).toMatchObject({ mm: 3450 });
    expect(parseScaleNotation("Schaal 1:50 (A4)")).toEqual({ denominator: 50, text: "Schaal 1:50" });
    expect(parseScaleNotation("om 1:37 uur")).toBeNull();
    expect(isNotToScale("Indeling — NIET OP SCHAAL")).toBe(true);
  });
});

describe("koppeling van labels", () => {
  it("koppelt een maatlabel onder de kamernaam", () => {
    const r = analyzeText([item("Woonkamer", 100, 100), item("5.40 x 4.10", 98, 113, 9)], ctx);
    expect(r.rooms).toHaveLength(1);
    expect(r.rooms[0]).toMatchObject({ name: "Woonkamer", pairing: "dichtbij", dims: { lengthMm: 5400, widthMm: 4100 } });
  });

  it("koppelt niet als het label even ver van twee kamers ligt", () => {
    const r = analyzeText([item("Keuken", 100, 100), item("Hal", 160, 100), item("3.00 x 2.00", 115, 118, 9)], ctx);
    expect(r.rooms.every((room) => room.dims === null)).toBe(true);
    expect(r.rooms.flatMap((room) => room.notes).join(" ")).toMatch(/tussen twee ruimtes/);
  });

  it("neemt onzeker gelezen OCR-maten niet over", () => {
    const r = analyzeText([item("Woonkamer", 100, 100, 10, 92), item("6.00 x 8.00", 98, 113, 9, 41)], { ...ctx, method: "ocr" });
    expect(r.rooms[0]!.dims).toBeNull();
    expect(r.rooms[0]!.notes.join(" ")).toMatch(/onzeker gelezen/);
  });

  it("bij onvoldoende kwaliteit worden geen exacte maten gegenereerd", () => {
    const r = analyzeText([item("Woonkamer", 100, 100, 10, 30), item("6.00 x 8.00", 98, 113, 9, 35)], { method: "ocr", imageWidthPx: 400, minImageWidthPx: 800 });
    expect(r.quality).toBe("onvoldoende");
    expect(r.rooms.every((room) => room.dims === null && room.areaM2 === null)).toBe(true);
  });
});

describe("analyse van PDF-fixtures (echte PDF.js-tekst)", () => {
  it("appartement: kamers, maten, oppervlaktelabel en schaal 1:50", async () => {
    const { items } = await fixturePageText("appartement.pdf");
    const r = analyzeText(items, ctx);
    const byName = Object.fromEntries(r.rooms.map((room) => [room.name, room]));
    expect(Object.keys(byName).sort()).toEqual(
      ["Badkamer", "Berging", "Hal", "Keuken", "Slaapkamer 1", "Slaapkamer 2", "Toilet", "Werkkamer", "Woonkamer"].sort(),
    );
    expect(byName["Keuken"]!.dims).toMatchObject({ lengthMm: 3000, widthMm: 3000 });
    expect(byName["Slaapkamer 1"]!.dims).toMatchObject({ lengthMm: 3000, widthMm: 4200 });
    expect(byName["Woonkamer"]!.dims).toBeNull();
    expect(byName["Woonkamer"]!.areaM2?.value).toBe(40.5);
    expect(r.scaleNotation?.denominator).toBe(50);
    expect(r.quality).toBe("goed");

    // Rooms become editable, unconfirmed suggestions; nothing is "gecontroleerd" yet.
    const rooms = roomsFromAnalysis(r, 0);
    const project = { ...newProject(), rooms };
    const c = computeProject(project);
    expect(c.verified).toBe(false);
    expect(c.rooms.find((x) => x.room.name === "Woonkamer")!.netAreaMm2).toBeCloseTo(40_500_000, 3);
    expect(c.rooms.every((x) => x.status !== "derived")).toBe(true);
    // The L-shaped woonkamer is not turned into a rectangle.
    expect(rooms.find((x) => x.name === "Woonkamer")!.shape.kind).toBe("area");
  });

  it("schaalnotatie geeft een kandidaat-schaal die exact klopt met de tekening", async () => {
    const { items, viewport } = await fixturePageText("woonkamer-rechthoek.pdf");
    const r = analyzeText(items, ctx);
    const scale = scaleFromNotation(r, 0, "pdf")!;
    expect(scale.status).toBe("auto");
    // The fixture draws the room 5400 mm wide at 1:50 starting at x = 120 pt.
    const widthPt = 5400 / scale.mmPerUnit;
    expect(widthPt * scale.mmPerUnit).toBeCloseTo(5400, 6);
    expect(scale.mmPerUnit).toBeCloseTo((25.4 / 72) * 50, 9);
    expect(viewport.width).toBeCloseTo(595.28, 1);
    // Vertical dimension text "4100" is extracted as a vertical label.
    expect(items.some((i) => i.text === "4100" && i.vertical)).toBe(true);
    expect(r.lengthLabels.map((l) => l.mm).sort()).toEqual([4100, 5400]);
    expect(r.rooms[0]!.dims).toMatchObject({ lengthMm: 5400, widthMm: 4100 });
  });

  it("L-vorm: alleen het oppervlaktelabel, geen rechthoek verzonnen", async () => {
    const { items } = await fixturePageText("l-vorm.pdf");
    const r = analyzeText(items, ctx);
    expect(r.rooms[0]).toMatchObject({ name: "Woonkamer", dims: null, areaM2: { value: 34.5 } });
  });

  it("zonder schaal: geen schaalkandidaat, wel kamernamen, kalibratie nodig", async () => {
    const { items } = await fixturePageText("zonder-schaal.pdf");
    const r = analyzeText(items, ctx);
    expect(r.notToScale).toBe(true);
    expect(scaleFromNotation(r, 0, "pdf")).toBeNull();
    expect(r.rooms.map((x) => x.name).sort()).toEqual(["Keuken", "Woonkamer"]);
    expect(r.rooms.every((x) => x.dims === null)).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/niet op schaal/i);
    const rooms = roomsFromAnalysis(r, 0);
    expect(rooms.every((x) => x.shape.kind === "drawn")).toBe(true);
    expect(computeProject({ ...newProject(), rooms }).floor.requiredM2).toBeNull();
  });

  it("tweede pagina wordt los gelezen", async () => {
    const { items } = await fixturePageText("appartement.pdf", 2);
    const r = analyzeText(items, ctx);
    expect(r.rooms.map((x) => x.name)).toEqual(["Zolder"]);
  });
});
