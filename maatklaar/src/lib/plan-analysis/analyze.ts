import { isNotToScale, isWindowLabel, matchRoomName, parseArea, parseDimensionPair, parseScaleNotation, parseSingleLength } from "./classify";
import { mergeLines, type TextLine } from "./lines";
import { center, type Box, type LengthLabel, type RoomCandidate, type ScaleNotation, type TextItem } from "./types";

/** OCR words below this confidence are shown as suggestions but never used as a measurement. */
export const MIN_OCR_CONFIDENCE_FOR_VALUES = 70;

export type Quality = "goed" | "matig" | "onvoldoende";

export type AnalysisResult = {
  method: "pdf-tekst" | "ocr";
  lines: TextLine[];
  rooms: RoomCandidate[];
  lengthLabels: LengthLabel[];
  areaLabels: { value: number; text: string; box: Box }[];
  windowLabels: { text: string; box: Box }[];
  scaleNotation: ScaleNotation | null;
  notToScale: boolean;
  quality: Quality;
  reasons: string[];
  meanConfidence: number | null;
};

const boxOf = (l: TextLine): Box => ({ x: l.x, y: l.y, w: l.w, h: l.h });

type Measurement = { line: TextLine; kind: "dims" | "area" };

/**
 * Links measurement labels to room labels. A label is only linked when one room is clearly closest
 * (below or beside it); when two rooms are about equally close, the link is "ambigu" and not made.
 */
function pair(roomLines: TextLine[], measurements: Measurement[]) {
  const assigned = new Map<TextLine, Measurement[]>();
  const ambiguous = new Map<TextLine, string[]>();
  for (const m of measurements) {
    const mc = center(m.line);
    const candidates = roomLines
      .map((r) => {
        const rc = center(r);
        const dy = mc.y - rc.y;
        const dx = Math.abs(mc.x - rc.x);
        const ok = dy > -r.h * 0.6 && dy < r.h * 5 && dx < Math.max(r.w, m.line.w) * 0.75 + r.h * 2;
        return { r, d: Math.hypot(dx, dy), ok };
      })
      .filter((c) => c.ok)
      .sort((a, b) => a.d - b.d);
    const best = candidates[0];
    if (!best) continue;
    const second = candidates[1];
    if (second && second.d < best.d * 1.35) {
      for (const c of [best, second]) {
        ambiguous.set(c.r, [...(ambiguous.get(c.r) ?? []), `Het label "${m.line.text}" ligt tussen twee ruimtes en is niet automatisch gekoppeld.`]);
      }
      continue;
    }
    assigned.set(best.r, [...(assigned.get(best.r) ?? []), m]);
  }
  return { assigned, ambiguous };
}

function pickClosest(room: TextLine, ms: Measurement[]): { m: Measurement | null; ambiguous: boolean } {
  if (!ms.length) return { m: null, ambiguous: false };
  const rc = center(room);
  const sorted = [...ms].sort((a, b) => Math.hypot(center(a.line).x - rc.x, center(a.line).y - rc.y) - Math.hypot(center(b.line).x - rc.x, center(b.line).y - rc.y));
  if (sorted.length > 1) {
    const d0 = Math.hypot(center(sorted[0]!.line).x - rc.x, center(sorted[0]!.line).y - rc.y);
    const d1 = Math.hypot(center(sorted[1]!.line).x - rc.x, center(sorted[1]!.line).y - rc.y);
    if (d1 < d0 * 1.5) return { m: null, ambiguous: true };
  }
  return { m: sorted[0]!, ambiguous: false };
}

export function assessQuality(input: {
  method: "pdf-tekst" | "ocr";
  textCount: number;
  meanConfidence: number | null;
  imageWidthPx: number | null;
  minImageWidthPx: number;
  roomCount: number;
  measurementCount: number;
}): { quality: Quality; reasons: string[] } {
  const reasons: string[] = [];
  let quality: Quality = "goed";
  const lower = (q: Quality) => {
    const order: Quality[] = ["goed", "matig", "onvoldoende"];
    if (order.indexOf(q) > order.indexOf(quality)) quality = q;
  };
  if (input.textCount === 0) {
    lower("onvoldoende");
    reasons.push(input.method === "pdf-tekst" ? "Deze PDF bevat geen leesbare tekst." : "We konden geen tekst lezen op deze afbeelding.");
  }
  if (input.method === "ocr" && input.meanConfidence !== null) {
    if (input.meanConfidence < 50) {
      lower("onvoldoende");
      reasons.push(`De tekst is slecht leesbaar (gemiddelde herkenningszekerheid ${Math.round(input.meanConfidence)}%).`);
    } else if (input.meanConfidence < MIN_OCR_CONFIDENCE_FOR_VALUES) {
      lower("matig");
      reasons.push(`Een deel van de tekst is onzeker gelezen (gemiddeld ${Math.round(input.meanConfidence)}%).`);
    }
  }
  if (input.imageWidthPx !== null) {
    if (input.imageWidthPx < input.minImageWidthPx * 0.6) {
      lower("onvoldoende");
      reasons.push(`De afbeelding heeft een lage resolutie (${input.imageWidthPx} pixels breed).`);
    } else if (input.imageWidthPx < input.minImageWidthPx) {
      lower("matig");
      reasons.push(`De afbeelding is vrij klein (${input.imageWidthPx} pixels breed); kleine maten kunnen onleesbaar zijn.`);
    }
  }
  if (input.textCount > 0 && input.roomCount === 0) {
    lower("matig");
    reasons.push("We vonden tekst, maar geen herkenbare kamernamen.");
  }
  if (input.textCount > 0 && input.measurementCount === 0) {
    lower("matig");
    reasons.push("We vonden geen maatlabels zoals 5,40 × 4,10 of 22 m².");
  }
  return { quality, reasons };
}

export function analyzeText(
  items: readonly TextItem[],
  ctx: { method: "pdf-tekst" | "ocr"; imageWidthPx: number | null; minImageWidthPx: number },
): AnalysisResult {
  const lines = mergeLines(items);
  const confs = items.map((i) => i.confidence).filter((c): c is number => c !== null);
  const meanConfidence = confs.length ? confs.reduce((s, c) => s + c, 0) / confs.length : null;

  const roomLines: TextLine[] = [];
  const measurements: Measurement[] = [];
  const lengthLabels: LengthLabel[] = [];
  const areaLabels: AnalysisResult["areaLabels"] = [];
  const windowLabels: AnalysisResult["windowLabels"] = [];
  let scaleNotation: ScaleNotation | null = null;
  let notToScale = false;

  for (const line of lines) {
    if (isNotToScale(line.text)) notToScale = true;
    const s = parseScaleNotation(line.text);
    if (s && !scaleNotation) scaleNotation = s;
    if (isWindowLabel(line.text)) windowLabels.push({ text: line.text, box: boxOf(line) });
    if (matchRoomName(line.text)) {
      roomLines.push(line);
      continue;
    }
    if (parseDimensionPair(line.text)) measurements.push({ line, kind: "dims" });
    const area = parseArea(line.text);
    if (area) {
      measurements.push({ line, kind: "area" });
      areaLabels.push({ ...area, box: boxOf(line) });
    }
    const single = parseSingleLength(line.text);
    if (single) lengthLabels.push({ ...single, text: line.text, box: boxOf(line) });
  }

  const { assigned, ambiguous } = pair(roomLines, measurements);

  const rooms: RoomCandidate[] = [];
  for (const line of roomLines) {
    const match = matchRoomName(line.text)!;
    const notes = [...(ambiguous.get(line) ?? [])];
    let dims = parseDimensionPair(line.text);
    let areaM2 = parseArea(line.text);
    let pairing: RoomCandidate["pairing"] = dims || areaM2 ? "zelfde-regel" : "geen";
    let lowConfidence = line.confidence !== null && line.confidence < MIN_OCR_CONFIDENCE_FOR_VALUES;

    const linked = assigned.get(line) ?? [];
    if (!dims) {
      const pick = pickClosest(line, linked.filter((m) => m.kind === "dims"));
      if (pick.ambiguous) notes.push("Bij deze ruimte staan meerdere maatlabels; kies zelf de juiste maten.");
      if (pick.m) {
        dims = parseDimensionPair(pick.m.line.text);
        pairing = "dichtbij";
        if (pick.m.line.confidence !== null && pick.m.line.confidence < MIN_OCR_CONFIDENCE_FOR_VALUES) lowConfidence = true;
      }
    }
    if (!areaM2) {
      const pick = pickClosest(line, linked.filter((m) => m.kind === "area"));
      if (pick.m) {
        areaM2 = parseArea(pick.m.line.text);
        if (pairing === "geen") pairing = "dichtbij";
        if (pick.m.line.confidence !== null && pick.m.line.confidence < MIN_OCR_CONFIDENCE_FOR_VALUES) lowConfidence = true;
      }
    }
    if (!dims && !areaM2 && notes.some((n) => n.includes("tussen twee"))) pairing = "ambigu";

    if (dims?.unit === "onzeker") {
      notes.push(`De eenheid van "${dims.text}" is niet eenduidig (centimeter of millimeter). Vul de maten zelf in.`);
      dims = null;
    }
    if (lowConfidence && (dims || areaM2)) {
      notes.push("De maten bij deze ruimte zijn onzeker gelezen. Controleer ze met de tekening; we nemen ze niet automatisch over.");
      dims = null;
      areaM2 = null;
    }
    if (dims && areaM2) {
      const rect = (dims.lengthMm * dims.widthMm) / 1_000_000;
      if (Math.abs(rect - areaM2.value) / areaM2.value > 0.05) {
        notes.push(`Op de tekening staat ${areaM2.text}, maar ${dims.text} geeft een andere oppervlakte. Mogelijk is de ruimte niet rechthoekig.`);
      }
    }

    const duplicate = rooms.find((r) => r.name === match.name && Math.hypot(center(r.box).x - center(line).x, center(r.box).y - center(line).y) < line.h * 3);
    if (duplicate) {
      if (!duplicate.dims && dims) Object.assign(duplicate, { dims, pairing });
      continue;
    }
    rooms.push({ name: match.name, text: line.text, box: boxOf(line), dims, areaM2, pairing, notes, confidence: line.confidence });
  }

  const { quality, reasons } = assessQuality({
    method: ctx.method,
    textCount: items.length,
    meanConfidence,
    imageWidthPx: ctx.imageWidthPx,
    minImageWidthPx: ctx.minImageWidthPx,
    roomCount: rooms.length,
    measurementCount: measurements.length + lengthLabels.length,
  });
  if (notToScale) reasons.push('Op de tekening staat dat hij niet op schaal is. Gebruik maatlabels of kalibreer met een maat die je zelf hebt gemeten.');

  // With insufficient quality nothing exact is generated: names stay as suggestions, values are dropped.
  if (quality === "onvoldoende") {
    for (const r of rooms) {
      if (r.dims || r.areaM2) r.notes.push("De scan is onvoldoende leesbaar; maten van deze ruimte zijn niet overgenomen.");
      r.dims = null;
      r.areaM2 = null;
    }
  }

  return { method: ctx.method, lines, rooms, lengthLabels, areaLabels, windowLabels, scaleNotation, notToScale, quality, reasons, meanConfidence };
}
