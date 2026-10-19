import type { MeasureKey } from "@/lib/measurements/schema";
import type { ProductRule, RuleInput } from "./schema";

/**
 * MaatKlaar's own measuring sheets: what to measure, never an order size (no selection). They hold for any
 * supplier; the order size then follows that supplier's instructions.
 */
const MAATKLAAR = {
  supplier: "MaatKlaar",
  title: "Algemeen MaatKlaar-meetblad (geen leveranciersregel)",
  url: null,
  checkedOn: "2026-10-19",
  rulesVersion: "2026.1",
  status: "published" as const,
  notes: "Eigen meetprotocol: zegt wat je meet, rekent geen bestelmaat uit.",
};

const mm = (key: MeasureKey, required = true): RuleInput => ({ kind: "mm", key, required });
const OPENING = [
  mm("breedte_boven"),
  mm("breedte_midden"),
  mm("breedte_onder"),
  mm("hoogte_links"),
  mm("hoogte_midden"),
  mm("hoogte_rechts"),
];
const BASE = {
  variant: "",
  variantLabel: "",
  supported: true,
  unsupportedReason: null,
  selection: null,
  depth: null,
  narrowest: null,
  overlap: null,
  deductions: null,
  supplierMakesDeduction: false,
  supplierAdds: null,
  rounding: null,
  limits: null,
  ambiguous: [],
};
const DECORATION = ["rolgordijn", "plisse", "jaloezie", "verticale_jaloezie", "vouwgordijn", "onbekend"] as const;

export const GENERIC_RULES: ProductRule[] = [
  {
    ...BASE,
    id: "protocol-in-de-dag",
    source: MAATKLAAR,
    families: [...DECORATION, "wave"],
    mount: "in_day",
    title: "Meetblad raamdecoratie in de dag",
    inputs: [...OPENING, mm("diepte"), { kind: "mm", key: "breedte_tegels", required: true, when: { check: "tegels", equals: true } }],
    checks: ["grepen", "ventilatierooster", "raam_openen", "vensterbank", "tegels"],
    notes: [
      "Raamopeningen zijn zelden overal even breed of hoog. Noteer elke meting; we middelen niets weg.",
      "Hoeveel er van je maat af gaat voor een product in de dag, verschilt per leverancier en product.",
    ],
  },
  {
    ...BASE,
    id: "protocol-op-de-dag",
    source: MAATKLAAR,
    families: [...DECORATION, "wave"],
    mount: "on_day",
    title: "Meetblad raamdecoratie op de dag",
    inputs: [mm("gewenste_breedte"), mm("gewenste_hoogte"), mm("ruimte_boven"), mm("breedte_midden", false), mm("hoogte_midden", false)],
    checks: ["radiator", "vensterbank", "grepen", "raam_openen"],
    notes: ["Op de dag kies je zelf hoeveel het product buiten de opening valt. Leg die keuze vast in je gewenste maten."],
  },
  ...(["wall", "ceiling"] as const).map((mount): ProductRule => ({
    ...BASE,
    id: mount === "wall" ? "protocol-gordijn" : "protocol-gordijn-plafond",
    source: MAATKLAAR,
    families: ["gordijn"],
    mount,
    title: mount === "wall" ? "Meetblad gordijnen (rail of roede)" : "Meetblad gordijnen (rail aan het plafond)",
    inputs: [
      mm("rail_breedte"),
      mm("ophanghoogte_links"),
      mm("ophanghoogte_midden"),
      mm("ophanghoogte_rechts"),
      mm("ruimte_boven", false),
      mm("breedte_midden", false),
    ],
    checks: ["radiator", "vensterbank", "ventilatierooster"],
    notes: [
      "De afgewerkte gordijnlengte hangt af van band, haken of runners en hoe ver boven de vloer je het gordijn wilt. Dat bepaalt je leverancier of naaiatelier.",
      "Vloeren lopen vaak niet waterpas; meet daarom links, midden en rechts.",
    ],
  })),
  ...(["shutter_front", "shutter_built_in"] as const).map((mount): ProductRule => ({
    ...BASE,
    id: mount === "shutter_front" ? "protocol-rolluik-voorzet" : "protocol-rolluik-inbouw",
    source: MAATKLAAR,
    families: ["rolluik"],
    mount,
    title: `Meetblad rolluik (${mount === "shutter_front" ? "voorzetrolluik" : "inbouwrolluik"})`,
    inputs: [...OPENING, mm("diepte"), mm("ruimte_boven")],
    checks: ["kast_ruimte", "geleiders", "stroom", "vensterbank", "raam_openen"],
    notes: [
      "Rolluiken vragen altijd extra controle: kastmaat, geleiders, montagepositie en bediening verschillen per fabrikant en per gevel.",
      "Meet de opening op drie plekken in beide richtingen; we middelen niets weg.",
    ],
  })),
  {
    ...BASE,
    id: "protocol-schroefloos",
    source: MAATKLAAR,
    families: ["rolgordijn", "plisse", "jaloezie"],
    mount: "screwless",
    title: "Meetblad schroefloze raamdecoratie (draaikiepraam)",
    inputs: [...OPENING, mm("kozijndiepte")],
    checks: ["grepen", "raam_openen"],
    notes: ["Schroefloze beugels klemmen op het kozijn: beoordeel elk raam apart, ook als ze er hetzelfde uitzien."],
  },
  {
    ...BASE,
    id: "protocol-dakraam",
    source: MAATKLAAR,
    families: ["dakraam"],
    mount: "roof_window",
    title: "Meetblad dakraamdecoratie",
    inputs: [{ kind: "answer", key: "dakraam_code", required: true }],
    checks: [],
    notes: ["Raamdecoratie voor dakramen bestel je op merk en typecode van het raam, niet op een gemeten glasmaat."],
  },
];
