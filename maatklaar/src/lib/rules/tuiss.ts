import type { MeasureKey } from "@/lib/measurements/schema";
import type { ProductRule, RuleInput } from "./schema";

/**
 * Tuiss adapter: the measuring rules from the Tuiss measuring guide, for Tuiss products only. Never a
 * universal rule for other manufacturers.
 *
 * Status: CONCEPT. The rules below were summarised from the guide by the client on 2026-10-19. On that date
 * a web search confirmed part of them (roller blind depths 50/70 and 120/105 mm, the 25 mm tile rule, 70 mm
 * depth for 50 mm slats, the 70/50 mm overlap for venetian blinds on the frame, 15 mm for screwless
 * mounting); the rest was not seen in the source. A person must compare every record with the full guide
 * and the product pages, set `checkedOn` and `status: "published"` and bump `rulesVersion`. Until then the
 * engine gives at most a concept order size. The wording here is our own; no supplier text or images.
 */
const SOURCE = {
  supplier: "Tuiss",
  title: "Tuiss meetgids raamdecoratie",
  url: "https://www.raamdecoratievantuiss.nl/meten-voor-raamdecoratie",
  checkedOn: null,
  rulesVersion: "2026.1",
  status: "concept" as const,
  notes:
    "Samengevat door de opdrachtgever (2026-10-19), deels bevestigd via zoekresultaten; nog niet tegen de volledige gids gecontroleerd.",
};

const mm = (key: MeasureKey, required = true): RuleInput => ({ kind: "mm", key, required });
const WIDTHS: MeasureKey[] = ["breedte_boven", "breedte_midden", "breedte_onder"];
const HEIGHTS: MeasureKey[] = ["hoogte_links", "hoogte_midden", "hoogte_rechts"];
const OPENING = [...WIDTHS, ...HEIGHTS].map((k) => mm(k));
const TILES: RuleInput = { kind: "mm", key: "breedte_tegels", required: true, when: { check: "tegels", equals: true } };
const NO_EXTRA = "Tuiss verwerkt de aftrek voor montage in de dag zelf: geef je maat zonder eigen aftrek.";

const BASE = {
  source: SOURCE,
  supported: true,
  unsupportedReason: null,
  narrowest: null,
  overlap: null,
  deductions: null,
  supplierMakesDeduction: false,
  supplierAdds: null,
  rounding: null,
  limits: null,
  ambiguous: [],
};

/** In the recess, "smallest of three" products: width and height are the smallest measurement, incl. the narrowest point. */
function inDaySmallest(
  id: string,
  families: ProductRule["families"],
  variant: string,
  variantLabel: string,
  minDepthMm: number | null,
): ProductRule {
  return {
    ...BASE,
    id,
    families,
    variant,
    variantLabel,
    mount: "in_day",
    title: `Tuiss · ${variantLabel} in de dag`,
    inputs: [...OPENING, mm("diepte"), mm("smalste_breedte", false), TILES],
    checks: ["grepen", "tegels", "raam_openen", "vensterbank"],
    selection: {
      width: { kind: "minimum", of: [...WIDTHS, "smalste_breedte", "breedte_tegels"] },
      height: { kind: "minimum", of: HEIGHTS },
    },
    depth: { key: "diepte", minMm: minDepthMm, byAnswer: null, straight: false },
    supplierMakesDeduction: true,
    ambiguous:
      minDepthMm === null
        ? [
            {
              id: "diepte-onbekend",
              question: `De minimale montagediepte voor ${variantLabel.toLowerCase()} staat niet in onze samenvatting van de gids. Controleer die bij Tuiss.`,
            },
          ]
        : [],
    notes: [
      "Meet de breedte op drie hoogtes en de hoogte op drie plekken; de kleinste maat telt, ook het smalste punt bij tegels of een greep.",
      NO_EXTRA,
    ],
  };
}

const VENETIAN: [string, string, number][] = [
  ["hout-25", "Houten jaloezie, lamel 25 mm", 55],
  ["hout-35-38", "Houten jaloezie, lamel 35–38 mm", 65],
  ["hout-50", "Houten jaloezie, lamel 50 mm", 70],
  ["hout-63-65", "Houten jaloezie, lamel 63–65 mm", 80],
  ["alu-25", "Aluminium jaloezie, lamel 25 mm", 30],
  ["alu-50", "Aluminium jaloezie, lamel 50 mm", 70],
];

/** Roller blinds in the recess: the top width counts, or the width between tiles when that is clearly narrower. */
function rollerInDay(variant: string, variantLabel: string, depth: ProductRule["depth"], extraQuestion?: string): ProductRule {
  return {
    ...BASE,
    id: `tuiss-rolgordijn-${variant}-in-de-dag`,
    families: ["rolgordijn"],
    variant,
    variantLabel,
    mount: "in_day",
    title: `Tuiss · ${variantLabel} in de dag`,
    inputs: [
      ...OPENING,
      mm("diepte"),
      TILES,
      ...(depth?.byAnswer ? [{ kind: "answer" as const, key: "bevestiging" as const, required: true }] : []),
    ],
    checks: ["grepen", "tegels", "raam_openen", "vensterbank"],
    selection: {
      width: { kind: "position", key: "breedte_boven" },
      height: {
        kind: "unspecified",
        question:
          "Welke hoogtemaat Tuiss voor een rolgordijn in de dag gebruikt, staat niet in onze samenvatting van de gids. Controleer dat voordat je bestelt.",
      },
    },
    depth,
    narrowest: { when: "tegels", wide: "breedte_boven", narrow: "breedte_tegels", thresholdMm: 25 },
    supplierMakesDeduction: true,
    ambiguous: extraQuestion ? [{ id: "variant-breedte", question: extraQuestion }] : [],
    notes: [
      "Voor een rolgordijn in de dag telt de bovenste breedtemaat.",
      "Tegels in de dag: is de bovenmaat minder dan 25 mm breder dan de maat tussen de tegels, dan telt de bovenmaat; is het verschil groter, dan de maat tussen de tegels. Bij precies 25 mm vragen we het na.",
      NO_EXTRA,
    ],
  };
}

export const TUISS_RULES: ProductRule[] = [
  ...VENETIAN.map(([variant, label, depth]) => inDaySmallest(`tuiss-jaloezie-${variant}-in-de-dag`, ["jaloezie"], variant, label, depth)),
  inDaySmallest("tuiss-vouwgordijn-in-de-dag", ["vouwgordijn"], "", "Vouwgordijn", 50),
  inDaySmallest("tuiss-verticale-jaloezie-in-de-dag", ["verticale_jaloezie"], "", "Verticale jaloezie", 75),
  inDaySmallest("tuiss-plisse-enkel-in-de-dag", ["plisse"], "enkel", "Plissé", null),
  inDaySmallest("tuiss-plisse-duo-in-de-dag", ["plisse"], "duo", "Duo-plissé", 45),
  rollerInDay("enkel", "Rolgordijn", {
    key: "diepte",
    minMm: null,
    byAnswer: { key: "bevestiging", values: { plafond: 50, wand: 70 } },
    straight: false,
  }),
  rollerInDay("dubbel", "Dubbel rolgordijn", {
    key: "diepte",
    minMm: null,
    byAnswer: { key: "bevestiging", values: { plafond: 120, wand: 105 } },
    straight: false,
  }),
  rollerInDay(
    "duo",
    "Duo-rolgordijn",
    { key: "diepte", minMm: 85, byAnswer: null, straight: false },
    "Geldt de bovenste breedtemaat en de tegelregel ook voor een duo-rolgordijn? Onze samenvatting zegt dat alleen voor rolgordijnen.",
  ),
  {
    ...BASE,
    id: "tuiss-jaloezie-op-de-dag",
    families: ["jaloezie"],
    variant: "",
    variantLabel: "Jaloezie",
    mount: "on_day",
    title: "Tuiss · Jaloezie op de dag",
    inputs: [mm("gewenste_breedte"), mm("gewenste_hoogte"), mm("breedte_midden"), mm("hoogte_midden"), mm("ruimte_boven")],
    checks: ["radiator", "vensterbank", "grepen", "raam_openen"],
    selection: { width: { kind: "chosen", key: "gewenste_breedte" }, height: { kind: "chosen", key: "gewenste_hoogte" } },
    depth: null,
    overlap: { kind: "guideline", topMm: 70, sidesMm: 50, bottomMm: null },
    notes: [
      "Op de dag bestel je de buitenmaat die je wilt, niet de opening. Richtlijn van de gids: 70 mm boven en 50 mm aan elke kant over de opening heen.",
      "Hoeveel het product onder de opening doorloopt, kies je zelf.",
    ],
  },
  inDaySmallestWave(),
  {
    ...BASE,
    id: "tuiss-wave-op-de-dag",
    families: ["wave"],
    variant: "",
    variantLabel: "Wave-gordijn",
    mount: "on_day",
    title: "Tuiss · Wave-gordijn op de dag",
    inputs: [mm("gewenste_breedte"), mm("gewenste_hoogte"), mm("breedte_midden"), mm("hoogte_midden"), mm("ruimte_boven")],
    checks: ["radiator", "vensterbank", "ventilatierooster"],
    selection: { width: { kind: "chosen", key: "gewenste_breedte" }, height: { kind: "chosen", key: "gewenste_hoogte" } },
    depth: null,
    overlap: { kind: "minimum", topMm: 150, sidesMm: 150, bottomMm: null },
    notes: ["Op de dag: minstens 150 mm overlap boven en aan beide kanten van de opening."],
  },
  ...(["wall", "ceiling"] as const).map((mount): ProductRule => ({
    ...BASE,
    id: `tuiss-gordijn-${mount === "wall" ? "wand" : "plafond"}`,
    families: ["gordijn"],
    variant: "",
    variantLabel: "Gordijn",
    mount,
    title: `Tuiss · Gordijn aan ${mount === "wall" ? "de wand" : "het plafond"}`,
    inputs: [
      mm("rail_breedte"),
      mm("ophanghoogte_links"),
      mm("ophanghoogte_midden"),
      mm("ophanghoogte_rechts"),
      mm("breedte_midden", false),
      mm("roede_diameter", false),
      { kind: "answer", key: "eindpunt", required: true },
      { kind: "answer", key: "ophanging", required: true },
      { kind: "answer", key: "nieuwe_rail", required: true },
    ],
    checks: ["radiator", "vensterbank", "ventilatierooster"],
    selection: {
      width: { kind: "chosen", key: "rail_breedte" },
      height: {
        kind: "unspecified",
        question:
          "Welke ophanghoogte (links, midden of rechts) en hoeveel speling boven de vloer of vensterbank Tuiss aanhoudt, staat niet in onze samenvatting. Controleer dat bij het bestellen.",
      },
    },
    depth: null,
    supplierAdds: { heightMm: 30, when: "ringen aan een roede tot 30 mm diameter, gemeten vanaf de bovenkant van de roede" },
    notes: [
      "De breedte is de rail of roede, niet alleen de raamopening.",
      "Nieuwe rail: richtlijn ongeveer 150 tot 200 mm extra aan elke kant van het raam en ongeveer 150 mm boven het raam.",
      "Meet de lengte vanaf het ophangpunt: bij een rail vanaf de rail, bij ringen vanaf de onderkant van de ring.",
      "Ringen aan een roede tot 30 mm: meet vanaf de bovenkant van de roede; Tuiss telt die 30 mm er zelf bij. Tel ze niet nog eens op.",
    ],
  })),
  {
    ...BASE,
    id: "tuiss-schroefloos",
    families: ["plisse", "rolgordijn", "jaloezie"],
    variant: "",
    variantLabel: "Schroefloze raamdecoratie",
    mount: "screwless",
    title: "Tuiss · Schroefloos op een draaikiepraam",
    inputs: [...OPENING, mm("kozijndiepte")],
    checks: ["grepen", "raam_openen"],
    selection: { width: { kind: "minimum", of: WIDTHS }, height: { kind: "minimum", of: HEIGHTS } },
    depth: { key: "kozijndiepte", minMm: 15, byAnswer: null, straight: true },
    supplierMakesDeduction: true,
    ambiguous: [
      {
        id: "schroefloos-producten",
        question: "Voor welke Tuiss-producten de schroefloze montage geldt, staat niet in onze samenvatting. Controleer dat per product.",
      },
    ],
    notes: [
      "Schroefloos klemmen kan alleen met minstens 15 mm rechte kozijndiepte. Beoordeel elk raam apart.",
      "Meet breedte en hoogte op drie plekken; de kleinste maat telt.",
    ],
  },
  {
    ...BASE,
    id: "tuiss-dakraam",
    families: ["dakraam"],
    variant: "",
    variantLabel: "Dakraamdecoratie",
    mount: "roof_window",
    title: "Tuiss · Raamdecoratie voor een dakraam",
    inputs: [{ kind: "answer", key: "dakraam_code", required: true }],
    checks: [],
    selection: { width: { kind: "by_code", key: "dakraam_code" }, height: { kind: "by_code", key: "dakraam_code" } },
    depth: null,
    ambiguous: [
      {
        id: "dakraam-compatibiliteit",
        question: "Of er een Tuiss-product past bij dit dakraam, hangt af van merk en typecode. Laat Tuiss dat met de code controleren.",
      },
    ],
    notes: ["Neem merk en typecode over van het typeplaatje van het dakraam. We leiden geen code af uit de glasmaat."],
  },
];

function inDaySmallestWave(): ProductRule {
  const base = inDaySmallest("tuiss-wave-in-de-dag", ["wave"], "", "Wave-gordijn", 75);
  return {
    ...base,
    deductions: { widthMm: 10, heightMm: 15, appliedBy: "leverancier" },
    notes: [
      "Meet breedte en hoogte op drie plekken en het smalste punt bij obstakels; de kleinste maat telt.",
      "Tuiss trekt zelf 10 mm van de breedte en 15 mm van de hoogte af. Trek dat er niet zelf al af.",
      "Minstens 75 mm diepte in de dag.",
    ],
  };
}
