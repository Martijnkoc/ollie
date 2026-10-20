/**
 * The brand in one place. Everything a visitor, a search engine or a report reader sees as the brand comes from
 * here: name, taglines, colours, file names, metadata and structured data. Renaming the product is one change in
 * this file (plus, if wanted, the logo mark in src/components/brand/Logo.tsx).
 *
 * "MaatKlaar" stays the internal project name: the folder, the database schema and role, browser storage keys and
 * the id of our own measuring sheets. It is never shown.
 */
export const BRAND = {
  /** Public name. Chosen by the owner; Benelux trademark (BOIP) and domains still to be confirmed (docs/NAAMVOORSTEL.md). */
  name: "Metrivo",
  /** Internal project name; never shown to visitors. */
  internalName: "MaatKlaar",
  /** Shown as a small note wherever the brand appears, while the name is not yet registered. Off: the owner chose it. */
  isWorkingTitle: false,
  /** Primary tagline. */
  tagline: "Eerst Metrivo.",
  /** Supporting promise. */
  promise: "Van jouw woning naar een duidelijke bestellijst. Minder meten, minder rekenen, minder twijfel.",
  /** The core rule, used as a short line under headings and in the report. */
  rule: "Meten. Berekenen. Goed bestellen.",
  /** Default description for search results and link previews. */
  description:
    "Breng je woning in kaart: plattegrond uploaden, kamers controleren en gratis je vloer en verf berekenen. Ramen meet je met je telefoon. Voor € 8,99 eenmalig een compleet rapport met bestellijst. Geen abonnement.",
  /** Base for file names of downloads (reports, CSV). */
  fileSlug: "metrivo",
  /** Public address used for canonical URLs, the sitemap and structured data. Overridden by APP_URL. */
  defaultUrl: "https://maatklaar.vercel.app",
  locale: "nl_NL",
  language: "nl-NL",
  /** Brand colours. The same values drive the CSS tokens (globals.css), the PDF and the share image. */
  colors: {
    graphite: "#191C1A",
    offWhite: "#F4F2EC",
    signal: "#FF6A35",
    /** Signal orange dark enough for text and links on light backgrounds (AA). */
    signalInk: "#B5441B",
    steel: "#68716B",
    surface: "#E9E8E1",
    white: "#FFFFFF",
  },
} as const;

/** The site's public base URL, without a trailing slash. */
export function siteUrl() {
  const fromEnv = typeof process !== "undefined" ? process.env.APP_URL?.trim() : undefined;
  return (fromEnv || BRAND.defaultUrl).replace(/\/+$/, "");
}
