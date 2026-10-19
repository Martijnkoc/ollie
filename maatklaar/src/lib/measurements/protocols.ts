import { MEASURE_DEVIATION_WARNING_MM } from "@/config/site";
import { SUPPLIER_RULES } from "@/config/measurement-rules";
import { measurementRuleSetSchema, type MeasurementRuleSet, type Mounting, type ProductFamily } from "./schema";

/**
 * Generic MaatKlaar measuring protocols. They describe *what* to measure and which checks matter.
 * They contain no supplier rules and never compute an order size: the result is a measuring sheet
 * with raw measurements that the user takes to the supplier of their choice.
 */
const tolerance = { breedte: MEASURE_DEVIATION_WARNING_MM, hoogte: MEASURE_DEVIATION_WARNING_MM, ophanghoogte: 10 };
const SOURCE = { label: "Algemeen MaatKlaar-meetprotocol — geen leveranciersregel" };

export const PROTOCOLS: MeasurementRuleSet[] = [
  {
    id: "protocol-in-de-dag",
    version: "1.0",
    date: "2026-10-19",
    kind: "protocol",
    title: "Meetblad raamdecoratie in de dag",
    productFamilies: ["rolgordijn", "plisse", "jaloezie", "vouwgordijn", "onbekend"],
    mounting: "in-de-dag",
    source: SOURCE,
    required: ["breedte_boven", "breedte_midden", "breedte_onder", "hoogte_links", "hoogte_midden", "hoogte_rechts", "diepte"],
    optional: [],
    toleranceMm: tolerance,
    checks: ["grepen", "ventilatierooster", "raam_openen", "vensterbank"],
    minDepthMm: null,
    conversion: { kind: "none" },
    warnings: [
      "Raamopeningen zijn zelden overal even breed of hoog. Noteer elke meting; we middelen niets weg.",
      "Hoeveel er van je maat af gaat voor een product in de dag, verschilt per leverancier en product.",
    ],
    supplierCheckRequired: ["Bestelmaat en minimale montagediepte volgens de meetinstructie van je leverancier."],
  },
  {
    id: "protocol-op-de-dag",
    version: "1.0",
    date: "2026-10-19",
    kind: "protocol",
    title: "Meetblad raamdecoratie op de dag",
    productFamilies: ["rolgordijn", "plisse", "jaloezie", "vouwgordijn", "onbekend"],
    mounting: "op-de-dag",
    source: SOURCE,
    required: ["gewenste_breedte", "gewenste_hoogte", "ruimte_boven"],
    optional: ["breedte_midden", "hoogte_midden"],
    toleranceMm: tolerance,
    checks: ["radiator", "vensterbank", "grepen", "raam_openen"],
    minDepthMm: null,
    conversion: { kind: "none" },
    warnings: ["Op de dag kies je zelf hoeveel het product buiten de opening valt. Leg die keuze vast in je gewenste maten."],
    supplierCheckRequired: ["Bestelmaat, montagehoogte en benodigde ruimte voor de steunen volgens je leverancier."],
  },
  {
    id: "protocol-gordijn",
    version: "1.0",
    date: "2026-10-19",
    kind: "protocol",
    title: "Meetblad gordijnen (rail of roede)",
    productFamilies: ["gordijn"],
    mounting: "wand",
    source: SOURCE,
    required: ["rail_breedte", "ophanghoogte_links", "ophanghoogte_midden", "ophanghoogte_rechts"],
    optional: ["ruimte_boven", "breedte_midden"],
    toleranceMm: tolerance,
    checks: ["radiator", "vensterbank", "ventilatierooster"],
    minDepthMm: null,
    conversion: { kind: "none" },
    warnings: [
      "De afgewerkte gordijnlengte hangt af van band, haken of runners en hoe ver boven de vloer je het gordijn wilt. Dat bepaalt je leverancier of naaiatelier.",
      "Vloeren lopen vaak niet waterpas; meet daarom links, midden en rechts.",
    ],
    supplierCheckRequired: ["Afgewerkte lengte, plooi- of volheidsfactor en bandtype met je leverancier of naaiatelier."],
  },
  {
    id: "protocol-gordijn-plafond",
    version: "1.0",
    date: "2026-10-19",
    kind: "protocol",
    title: "Meetblad gordijnen (rail aan het plafond)",
    productFamilies: ["gordijn"],
    mounting: "plafond",
    source: SOURCE,
    required: ["rail_breedte", "ophanghoogte_links", "ophanghoogte_midden", "ophanghoogte_rechts"],
    optional: ["breedte_midden"],
    toleranceMm: tolerance,
    checks: ["radiator", "vensterbank", "ventilatierooster"],
    minDepthMm: null,
    conversion: { kind: "none" },
    warnings: [
      "Meet de ophanghoogte vanaf het plafond waar de rail komt, op drie plekken.",
      "De afgewerkte gordijnlengte hangt af van rail, runners en bandtype. Dat bepaalt je leverancier.",
    ],
    supplierCheckRequired: ["Afgewerkte lengte, plooi- of volheidsfactor en bandtype met je leverancier of naaiatelier."],
  },
  ...(["voorzet", "inbouw"] as const).map((mounting): MeasurementRuleSet => ({
    id: `protocol-rolluik-${mounting}`,
    version: "1.0",
    date: "2026-10-19",
    kind: "protocol",
    title: `Meetblad rolluik (${mounting === "voorzet" ? "voorzetrolluik" : "inbouwrolluik"})`,
    productFamilies: ["rolluik"],
    mounting,
    source: SOURCE,
    required: [
      "breedte_boven",
      "breedte_midden",
      "breedte_onder",
      "hoogte_links",
      "hoogte_midden",
      "hoogte_rechts",
      "diepte",
      "ruimte_boven",
    ],
    optional: [],
    toleranceMm: tolerance,
    checks: ["kast_ruimte", "geleiders", "stroom", "vensterbank", "raam_openen"],
    minDepthMm: null,
    conversion: { kind: "none" },
    warnings: [
      "Rolluiken vragen altijd extra controle: kastmaat, geleiders, montagepositie en bediening verschillen per fabrikant en per gevel.",
      "Meet de opening op drie plekken in beide richtingen; we middelen niets weg.",
    ],
    supplierCheckRequired: [
      "Kastmaat, geleidertype, bestelmaat en montagepositie volgens de inmeetinstructie van de fabrikant of een monteur.",
      "Bij gevelwerk of een gehuurde woning: toestemming van eigenaar of VvE.",
    ],
  })),
];

for (const rule of [...PROTOCOLS, ...SUPPLIER_RULES]) measurementRuleSetSchema.parse(rule);

export const ALL_RULES: MeasurementRuleSet[] = [...PROTOCOLS, ...SUPPLIER_RULES];

export function findRule(id: string, rules: readonly MeasurementRuleSet[] = ALL_RULES) {
  return rules.find((r) => r.id === id) ?? null;
}

/** The generic protocol that fits a product and mounting. Unknown mounting falls back to measuring the opening itself. */
export function defaultRuleFor(family: ProductFamily, mounting: Mounting): MeasurementRuleSet {
  if (family === "gordijn") return findRule(mounting === "plafond" ? "protocol-gordijn-plafond" : "protocol-gordijn")!;
  if (family === "rolluik") return findRule(mounting === "inbouw" ? "protocol-rolluik-inbouw" : "protocol-rolluik-voorzet")!;
  return findRule(mounting === "op-de-dag" ? "protocol-op-de-dag" : "protocol-in-de-dag")!;
}

/** Rules a user may choose for this window: the generic protocol plus any verified supplier rules that match. */
export function rulesFor(family: ProductFamily, mounting: Mounting, rules: readonly MeasurementRuleSet[] = ALL_RULES) {
  const generic = defaultRuleFor(family, mounting);
  const suppliers = rules.filter((r) => r.kind === "supplier" && r.mounting === mounting && r.productFamilies.includes(family));
  return [generic, ...suppliers];
}
