import { mmPerPointForNotation } from "@/lib/geometry/units";
import { newRoom } from "@/lib/projects/factory";
import type { Length, PageAnalysis, ProjectWindow, Room, Scale } from "@/lib/projects/schema";
import type { AnalysisResult } from "./analyze";
import { center } from "./types";

/** Turns recognised room labels into editable rooms. Everything is marked "auto" until the user confirms it. */
export function roomsFromAnalysis(result: AnalysisResult, page: number): Room[] {
  const source = result.method;
  return result.rooms.map((c) => {
    const anchor = center(c.box);
    const notes = [...c.notes];
    const auto = (mm: number, text: string): Length => ({ mm, status: "auto", source, sourceText: text });
    let room: Room;
    if (c.dims) {
      notes.unshift(`Vorm aangenomen als rechthoek op basis van het label "${c.dims.text}". Pas de vorm aan als de ruimte niet rechthoekig is.`);
      room = newRoom(c.name, { kind: "rect", length: auto(c.dims.lengthMm, c.dims.text), width: auto(c.dims.widthMm, c.dims.text) });
    } else if (c.areaM2) {
      notes.unshift(`Alleen de oppervlakte "${c.areaM2.text}" staat bij deze ruimte.`);
      room = newRoom(c.name, { kind: "area", m2: c.areaM2.value, status: "auto", source, sourceText: c.areaM2.text });
    } else {
      notes.unshift("Bij deze ruimte vonden we geen maten. Teken de ruimte op de plattegrond of vul lengte en breedte in.");
      room = newRoom(c.name, { kind: "drawn", page, points: [], status: "auto" });
    }
    return { ...room, nameStatus: "auto", origin: "auto", page, anchor, notes: notes.slice(0, 10) };
  });
}

export function windowsFromAnalysis(result: AnalysisResult, page: number, existing: readonly ProjectWindow[], make: (w: readonly ProjectWindow[], extra: Partial<ProjectWindow>) => ProjectWindow) {
  const out: ProjectWindow[] = [];
  for (const label of result.windowLabels) {
    out.push(make([...existing, ...out], { origin: "auto", page, position: center(label.box), label: label.text, note: `Gevonden als label "${label.text}" op de tekening.` }));
  }
  return out;
}

/**
 * A scale notation is only a candidate, and only for PDFs: the conversion assumes the PDF page is the real
 * paper size the notation refers to. Images have no reliable physical size, so they always need calibration.
 */
export function scaleFromNotation(result: AnalysisResult, page: number, kind: "pdf" | "png" | "jpeg" | "webp"): Scale | null {
  if (!result.scaleNotation || result.notToScale || kind !== "pdf") return null;
  return {
    page,
    mmPerUnit: mmPerPointForNotation(result.scaleNotation.denominator),
    method: "schaalnotatie",
    status: "auto",
    reference: null,
    notation: result.scaleNotation.denominator,
  };
}

export function analysisSummary(result: AnalysisResult, page: number, ranAt: Date): PageAnalysis {
  const findings: string[] = [];
  if (result.rooms.length) findings.push(`${result.rooms.length} ${result.rooms.length === 1 ? "mogelijke ruimte" : "mogelijke ruimtes"} gevonden.`);
  const withDims = result.rooms.filter((r) => r.dims).length;
  if (withDims) findings.push(`${withDims} met lengte × breedte op de tekening.`);
  if (result.scaleNotation) findings.push(`Schaalnotatie ${result.scaleNotation.text} gevonden.`);
  if (result.lengthLabels.length) findings.push(`${result.lengthLabels.length} losse maatlabels gevonden (bruikbaar bij kalibreren).`);
  return {
    page,
    method: result.method,
    ranAt: ranAt.toISOString(),
    quality: result.quality,
    reasons: result.reasons.slice(0, 10),
    meanConfidence: result.meanConfidence,
    counts: {
      textItems: result.lines.length,
      roomNames: result.rooms.length,
      dimensionLabels: result.rooms.filter((r) => r.dims).length + result.lengthLabels.length,
      areaLabels: result.areaLabels.length,
    },
    scaleNotation: result.scaleNotation,
    notToScale: result.notToScale,
    findings,
  };
}

