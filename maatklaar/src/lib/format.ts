/** Dutch number presentation. Calculations never round; only these functions do, at display time. */

const nf = (min: number, max: number, grouping = true) =>
  new Intl.NumberFormat("nl-NL", { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: grouping });

const two = nf(2, 2);
const one = nf(1, 1);
const whole = nf(0, 0);
const mmFormat = nf(0, 0, false);

/** 12345678 mm² → "12,35 m²" */
export function formatM2FromMm2(mm2: number) {
  return `${two.format(mm2 / 1_000_000)} m²`;
}

export function formatM2(m2: number) {
  return `${two.format(m2)} m²`;
}

/** 4200 mm → "4,20 m" */
export function formatMFromMm(mm: number) {
  return `${two.format(mm / 1000)} m`;
}

/** Whole millimetres without thousands separator, so "1234 mm" never reads as a decimal. */
export function formatMm(mm: number) {
  return `${mmFormat.format(mm)} mm`;
}

export function formatPercent(p: number) {
  return `${Number.isInteger(p) ? whole.format(p) : one.format(p)}%`;
}

export function formatCount(n: number) {
  return whole.format(n);
}

export function formatEuroCents(cents: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
}

/**
 * Parses a decimal typed by a Dutch user: "4,20", "4.20", " 4 " → number. Rejects anything ambiguous
 * (two separators, letters, empty) with null instead of guessing.
 */
export function parseDecimal(input: string): number | null {
  const s = input.trim().replace(/\s+/g, "");
  if (!/^\d+([.,]\d+)?$/.test(s)) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Room lengths are typed in metres and stored as whole millimetres. */
export function parseMetresToMm(input: string): number | null {
  const m = parseDecimal(input);
  if (m === null) return null;
  return Math.round(m * 1000);
}

/** Window measurements are typed in whole millimetres. */
export function parseWholeMm(input: string): number | null {
  const s = input.trim().replace(/\s+/g, "");
  if (!/^\d{1,6}$/.test(s)) return null;
  return Number(s);
}

/** Inverse of parseMetresToMm for form fields: 4200 → "4,2", 4205 → "4,205". */
export function mmToMetresInput(mm: number | null) {
  if (mm === null) return "";
  return String(mm / 1000).replace(".", ",");
}
