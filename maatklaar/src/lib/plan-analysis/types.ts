/** A piece of text found on a plan page. Coordinates in page units, origin top-left, y down. */
export type TextItem = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  source: "pdf-tekst" | "ocr";
  /** OCR word confidence 0–100; null for embedded PDF text. */
  confidence: number | null;
  vertical: boolean;
};

export type Box = { x: number; y: number; w: number; h: number };

export const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

export type DimensionPair = {
  lengthMm: number;
  widthMm: number;
  text: string;
  /** How the unit was determined. "onzeker" values are never used for calculations. */
  unit: "expliciet" | "decimaal-meter" | "plausibel" | "onzeker";
};

export type RoomCandidate = {
  name: string;
  text: string;
  box: Box;
  dims: DimensionPair | null;
  areaM2: { value: number; text: string } | null;
  /** How the label and its measurements were linked. */
  pairing: "zelfde-regel" | "dichtbij" | "ambigu" | "geen";
  notes: string[];
  confidence: number | null;
};

export type LengthLabel = { mm: number | null; text: string; box: Box; unit: DimensionPair["unit"] };

export type ScaleNotation = { denominator: number; text: string };
