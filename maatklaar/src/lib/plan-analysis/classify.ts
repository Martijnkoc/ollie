import type { DimensionPair, ScaleNotation } from "./types";

/** Lowercase, without accents and with abbreviation dots removed, for matching only. */
export function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Dutch room terms as they appear on makelaar- and bouwtekeningen. Order matters: longer terms first.
 * The result is a suggestion, never a guaranteed classification.
 */
const ROOM_TERMS: { re: RegExp; name: string }[] = [
  { re: /woon[\s/-]*(en\s*)?eet\s*kamer|woon[\s/-]*eetk/, name: "Woon-/eetkamer" },
  { re: /woon\s*keuken/, name: "Woonkeuken" },
  { re: /woon\s*kamer|woonk\.?(?=\s|$)|living/, name: "Woonkamer" },
  { re: /eet\s*kamer/, name: "Eetkamer" },
  { re: /bij\s*keuken/, name: "Bijkeuken" },
  { re: /keuken|keuk\.(?=\s|$)/, name: "Keuken" },
  { re: /slaap\s*kamer|slaapk\.?(?=\s|$)|slpk\.?(?=\s|$)|slk\.?(?=\s|$)/, name: "Slaapkamer" },
  { re: /logeer\s*kamer/, name: "Logeerkamer" },
  { re: /kinder\s*kamer/, name: "Kinderkamer" },
  { re: /studeer\s*kamer/, name: "Studeerkamer" },
  { re: /werk\s*kamer|kantoor|thuiswerkplek/, name: "Werkkamer" },
  { re: /hobby\s*kamer/, name: "Hobbykamer" },
  { re: /bad\s*kamer|badk\.?(?=\s|$)|douche\s*ruimte|badruimte/, name: "Badkamer" },
  { re: /toilet|(?<![a-z])wc(?![a-z])|toil\.(?=\s|$)/, name: "Toilet" },
  { re: /zolder\s*kamer/, name: "Zolderkamer" },
  { re: /zolder/, name: "Zolder" },
  { re: /vliering/, name: "Vliering" },
  { re: /was\s*ruimte|was\s*hok|was\s*plaats|was-?\s*\/\s*droogruimte/, name: "Wasruimte" },
  { re: /berging|(?<![a-z])berg\.(?=\s|$)/, name: "Berging" },
  { re: /overloop/, name: "Overloop" },
  { re: /entree|entre(?![a-z])/, name: "Entree" },
  { re: /(?<![a-z])hal(?![a-z])/, name: "Hal" },
  { re: /(?<![a-z])gang(?![a-z])/, name: "Gang" },
  { re: /meter\s*kast|(?<![a-z])mk(?![a-z])/, name: "Meterkast" },
  { re: /technische\s*ruimte|cv[\s-]*ruimte|installatie\s*ruimte/, name: "Technische ruimte" },
  { re: /inloop\s*kast|garderobe/, name: "Inloopkast" },
  { re: /provisie\s*kast/, name: "Provisiekast" },
  { re: /serre/, name: "Serre" },
  { re: /garage/, name: "Garage" },
  { re: /kelder|souterrain/, name: "Kelder" },
  { re: /schuur/, name: "Schuur" },
  { re: /dak\s*terras/, name: "Dakterras" },
  { re: /balkon/, name: "Balkon" },
  { re: /loggia/, name: "Loggia" },
  { re: /terras/, name: "Terras" },
  { re: /(?<![a-z])tuin(?![a-z])/, name: "Tuin" },
  { re: /(?<![a-z])vide(?![a-z])/, name: "Vide" },
  { re: /trapgat/, name: "Trapgat" },
];

/**
 * Recognises a room label. Accepts a room term, an optional number ("Slaapkamer 2") and an optional
 * measurement on the same line; anything else of substance (a sentence) is not a label.
 */
export function matchRoomName(text: string): { name: string; matched: string } | null {
  const n = normalize(text);
  if (n.length > 60) return null;
  for (const term of ROOM_TERMS) {
    const m = term.re.exec(n);
    if (!m) continue;
    const after = n.slice(m.index + m[0].length);
    const number = /^\s*(\d{1,2})(?![\d.,])/.exec(after);
    const rest = (n.slice(0, m.index) + " " + after.slice(number ? number[0].length : 0))
      .replace(DIMENSION_PAIR_RE, " ")
      .replace(AREA_RE, " ")
      .replace(/[^a-z]/g, "");
    if (rest.length > 8) continue;
    return { name: number ? `${term.name} ${number[1]}` : term.name, matched: m[0] };
  }
  return null;
}

const NUM = String.raw`(\d{1,2}[.,]\d{1,3}|\d{3,5})`;
const UNIT = String.raw`(mm|cm|m)?`;
export const DIMENSION_PAIR_RE = new RegExp(String.raw`${NUM}\s*${UNIT}\s*[x×*]\s*${NUM}\s*${UNIT}(?![\d²2])`, "i");
export const AREA_RE = /(?:opp\.?\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:m2|m²|m\^2|㎡)(?![a-z])/i;
const SINGLE_LENGTH_RE = new RegExp(String.raw`^\s*${NUM}\s*${UNIT}\s*$`, "i");

/** Room dimensions we consider physically plausible for one room: 0.5 m – 25 m. */
const ROOM_RANGE: [number, number] = [500, 25_000];
/** A labelled wall or segment: 0.2 m – 40 m. */
const SEGMENT_RANGE: [number, number] = [200, 40_000];

const inRange = (mm: number, [lo, hi]: [number, number]) => mm >= lo && mm <= hi;

function explicitToMm(value: string, unit: string) {
  const v = Number(value.replace(",", "."));
  return unit === "m" ? Math.round(v * 1000) : unit === "cm" ? Math.round(v * 10) : Math.round(v);
}

/**
 * Converts the numbers of one label to mm. With a unit or a decimal separator the unit is clear.
 * A bare integer is ambiguous (cm or mm); it is only resolved when exactly one unit gives plausible
 * values for every number of the label. Otherwise the unit stays "onzeker" and the value is not used.
 */
export function resolveLengths(
  values: string[],
  units: (string | undefined)[],
  range: [number, number],
): { mm: number[]; unit: DimensionPair["unit"] } | null {
  const explicit = units.find((u) => u);
  if (explicit) {
    const mm = values.map((v, i) => explicitToMm(v, (units[i] ?? explicit).toLowerCase()));
    return mm.every((x) => inRange(x, range)) ? { mm, unit: "expliciet" } : null;
  }
  if (values.every((v) => /[.,]/.test(v))) {
    const mm = values.map((v) => explicitToMm(v, "m"));
    return mm.every((x) => inRange(x, range)) ? { mm, unit: "decimaal-meter" } : null;
  }
  if (values.some((v) => /[.,]/.test(v))) return null; // mixed notation in one label: do not guess
  const asCm = values.map((v) => Number(v) * 10);
  const asMm = values.map((v) => Number(v));
  const cmOk = asCm.every((x) => inRange(x, range));
  const mmOk = asMm.every((x) => inRange(x, range));
  if (cmOk && !mmOk) return { mm: asCm, unit: "plausibel" };
  if (mmOk && !cmOk) return { mm: asMm, unit: "plausibel" };
  return { mm: asMm, unit: "onzeker" };
}

export function parseDimensionPair(text: string): DimensionPair | null {
  const m = DIMENSION_PAIR_RE.exec(text);
  if (!m) return null;
  const resolved = resolveLengths([m[1]!, m[3]!], [m[2], m[4]], ROOM_RANGE);
  if (!resolved) return null;
  return { lengthMm: resolved.mm[0]!, widthMm: resolved.mm[1]!, text: m[0].trim(), unit: resolved.unit };
}

export function parseArea(text: string): { value: number; text: string } | null {
  const m = AREA_RE.exec(text);
  if (!m) return null;
  const value = Number(m[1]!.replace(",", "."));
  if (!(value >= 0.5 && value <= 500)) return null;
  return { value, text: m[0].trim() };
}

export function parseSingleLength(text: string): { mm: number | null; unit: DimensionPair["unit"] } | null {
  const m = SINGLE_LENGTH_RE.exec(text);
  if (!m) return null;
  const resolved = resolveLengths([m[1]!], [m[2]], SEGMENT_RANGE);
  if (!resolved) return null;
  return { mm: resolved.unit === "onzeker" ? null : resolved.mm[0]!, unit: resolved.unit };
}

const SCALE_RE = /(?:schaal|scale)?\s*(?<![\d.,])1\s*:\s*(\d{1,4})(?![\d.,])/i;
const COMMON_DENOMINATORS = new Set([10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000]);

export function parseScaleNotation(text: string): ScaleNotation | null {
  const m = SCALE_RE.exec(text);
  if (!m) return null;
  const denominator = Number(m[1]);
  if (!COMMON_DENOMINATORS.has(denominator)) return null;
  return { denominator, text: m[0].trim() };
}

export function isNotToScale(text: string) {
  return /niet\s+op\s+schaal|geen\s+schaal|not\s+to\s+scale|(?<![a-z])n\.\s?o\.\s?s\.?|indicatief|maten\s+indicatief/i.test(text);
}

export function isWindowLabel(text: string) {
  return /^(raam|r\s?\d{1,2})$/i.test(text.trim());
}
