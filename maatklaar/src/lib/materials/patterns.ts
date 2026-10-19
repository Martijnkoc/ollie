/**
 * Laying patterns with a starting value for cutting waste. These are adjustable guide values, not truths:
 * the right percentage depends on the floor, the pattern, the shape of the rooms and the laying
 * instructions of the product. The interface always says so and lets the user change the percentage.
 */
export const PATTERNS = [
  { key: "recht", label: "Rechte banen / wildverband", guidePercent: 7 },
  { key: "halfsteens", label: "Halfsteens of vast verband", guidePercent: 8 },
  { key: "diagonaal", label: "Diagonaal", guidePercent: 12 },
  { key: "visgraat", label: "Visgraat", guidePercent: 15 },
  { key: "hongaarse-punt", label: "Hongaarse punt", guidePercent: 15 },
  { key: "eigen", label: "Eigen percentage", guidePercent: null },
] as const;

export type PatternKey = (typeof PATTERNS)[number]["key"];

export function patternByKey(key: string) {
  return PATTERNS.find((p) => p.key === key) ?? PATTERNS[0];
}

export const DEFAULT_PLINTH_MARGIN_PERCENT = 10;
