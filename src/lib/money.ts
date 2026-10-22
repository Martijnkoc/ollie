import { LOCALE, MAX_PRICE_CENTS, MIN_PRICE_CENTS, PLATFORM_FEE_BPS } from "./config";
import { UserError } from "./errors";

const euro = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR" });
const euroRound = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function formatEuro(cents: number | null | undefined) {
  if (cents == null) return "";
  return cents % 100 === 0 ? euroRound.format(cents / 100) : euro.format(cents / 100);
}

/** "150", "150,50", "€ 1.250" → cents. Returns null for an empty field. */
export function parseEuro(input: string | null | undefined): number | null {
  const raw = (input ?? "").replace(/[€\s]/g, "");
  if (!raw) return null;
  // Dutch notation: dots group thousands, a comma separates cents.
  const normalised = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(raw)
      ? raw.replace(/\./g, "")
      : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) throw new UserError("Vul een bedrag in, bijvoorbeeld 150 of 149,95.");
  return Math.round(Number(normalised) * 100);
}

export function assertPrice(cents: number | null, what = "De prijs") {
  if (cents == null) throw new UserError(`${what} is verplicht.`);
  if (cents < MIN_PRICE_CENTS) throw new UserError(`${what} is minimaal ${formatEuro(MIN_PRICE_CENTS)}.`);
  if (cents > MAX_PRICE_CENTS) throw new UserError(`${what} is maximaal ${formatEuro(MAX_PRICE_CENTS)}.`);
  return cents;
}

/** The split shown before anything is agreed: the buyer pays the price, the platform fee comes out of it. */
export function split(priceCents: number, feeBps = PLATFORM_FEE_BPS) {
  const fee = Math.round((priceCents * feeBps) / 10_000);
  return { price: priceCents, fee, seller: priceCents - fee, feeBps };
}

export function feePercentLabel(feeBps = PLATFORM_FEE_BPS) {
  return `${(feeBps / 100).toLocaleString(LOCALE)}%`;
}
