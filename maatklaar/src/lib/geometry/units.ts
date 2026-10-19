/**
 * Units used throughout MaatKlaar:
 * - "page units": PDF points (1/72 inch) for PDF pages, natural pixels for images;
 * - millimetres (mm) for every real-world length, mm² for areas;
 * - metres and m² only for presentation.
 */

/** One PDF point on paper is 25.4/72 mm. */
export const MM_PER_PT = 25.4 / 72;

export const MM_PER_M = 1000;
export const MM2_PER_M2 = 1_000_000;

export function mmToM(mm: number) {
  return mm / MM_PER_M;
}

export function mm2ToM2(mm2: number) {
  return mm2 / MM2_PER_M2;
}

export function m2ToMm2(m2: number) {
  return m2 * MM2_PER_M2;
}

/** Converts a length on the drawing to a real length using the drawing scale. */
export function unitsToMm(units: number, mmPerUnit: number) {
  return units * mmPerUnit;
}

/**
 * A scale notation like 1:100 on a PDF that is printed at its original paper size:
 * one point on paper is MM_PER_PT mm, so in reality it is MM_PER_PT × denominator mm.
 * Only valid when the PDF page size is the real paper size — the user must confirm that.
 */
export function mmPerPointForNotation(denominator: number) {
  return MM_PER_PT * denominator;
}

/** Scale from a calibration: a line of `units` on the drawing is `realMm` long in reality. */
export function mmPerUnitFromCalibration(units: number, realMm: number) {
  if (!(units > 0) || !(realMm > 0)) return null;
  return realMm / units;
}

/** Rounds up, but treats values within a tiny epsilon of an integer as that integer (20.000000001 → 20). */
export function ceilSafe(x: number, epsilon = 1e-9) {
  const r = Math.round(x);
  if (Math.abs(x - r) < epsilon) return r;
  return Math.ceil(x);
}
