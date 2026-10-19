import { z } from "zod";

export const PRODUCT_FAMILIES = ["gordijn", "rolgordijn", "plisse", "jaloezie", "onbekend"] as const;
export type ProductFamily = (typeof PRODUCT_FAMILIES)[number];

export const PRODUCT_LABELS: Record<ProductFamily, string> = {
  gordijn: "Gordijn (rail of roede)",
  rolgordijn: "Rolgordijn",
  plisse: "Plissé",
  jaloezie: "Jaloezie",
  onbekend: "Ik weet het nog niet",
};

export const MOUNTINGS = ["in-de-dag", "op-de-dag", "plafond", "wand", "onbekend"] as const;
export type Mounting = (typeof MOUNTINGS)[number];

export const MOUNTING_LABELS: Record<Mounting, string> = {
  "in-de-dag": "In de dag (binnen de raamopening)",
  "op-de-dag": "Op de dag (op of boven het kozijn)",
  plafond: "Rail aan het plafond",
  wand: "Rail of roede aan de wand",
  onbekend: "Weet ik nog niet",
};

/** Which mountings make sense for a product family. Curtains hang from a rail; the others sit in or on the opening. */
export function mountingsFor(family: ProductFamily): Mounting[] {
  return family === "gordijn" ? ["plafond", "wand", "onbekend"] : ["in-de-dag", "op-de-dag", "onbekend"];
}

export const MEASURE_KEYS = [
  "breedte_boven",
  "breedte_midden",
  "breedte_onder",
  "hoogte_links",
  "hoogte_midden",
  "hoogte_rechts",
  "diepte",
  "gewenste_breedte",
  "gewenste_hoogte",
  "ruimte_boven",
  "rail_breedte",
  "ophanghoogte_links",
  "ophanghoogte_midden",
  "ophanghoogte_rechts",
] as const;
export type MeasureKey = (typeof MEASURE_KEYS)[number];

/** Measuring points of one dimension are compared with each other; a large spread means re-measure. */
export const MEASURE_GROUPS = {
  breedte: ["breedte_boven", "breedte_midden", "breedte_onder"],
  hoogte: ["hoogte_links", "hoogte_midden", "hoogte_rechts"],
  ophanghoogte: ["ophanghoogte_links", "ophanghoogte_midden", "ophanghoogte_rechts"],
} as const satisfies Record<string, readonly MeasureKey[]>;
export type MeasureGroup = keyof typeof MEASURE_GROUPS;

export const MEASURE_INFO: Record<MeasureKey, { label: string; hint: string }> = {
  breedte_boven: { label: "Breedte boven", hint: "Van dag tot dag, vlak onder de bovenkant van de raamopening." },
  breedte_midden: { label: "Breedte midden", hint: "Van dag tot dag, halverwege de hoogte." },
  breedte_onder: { label: "Breedte onder", hint: "Van dag tot dag, vlak boven de vensterbank of onderdorpel." },
  hoogte_links: { label: "Hoogte links", hint: "Van bovenkant opening tot vensterbank, aan de linkerkant." },
  hoogte_midden: { label: "Hoogte midden", hint: "Van bovenkant opening tot vensterbank, in het midden." },
  hoogte_rechts: { label: "Hoogte rechts", hint: "Van bovenkant opening tot vensterbank, aan de rechterkant." },
  diepte: { label: "Diepte van de dag", hint: "Van de voorkant van de muur tot het glas of de glaslat: de ruimte voor montage." },
  gewenste_breedte: { label: "Gewenste breedte", hint: "De breedte die het product moet afdekken, inclusief de overlap die jij wilt." },
  gewenste_hoogte: { label: "Gewenste hoogte", hint: "Van het montagepunt tot waar het product moet eindigen." },
  ruimte_boven: { label: "Vrije ruimte boven", hint: "Van bovenkant kozijn of opening tot het plafond of een obstakel." },
  rail_breedte: { label: "Gewenste railbreedte", hint: "De lengte van de rail of roede die je wilt ophangen." },
  ophanghoogte_links: { label: "Ophanghoogte links", hint: "Van het ophangpunt (onderkant rail of plafond) tot de vloer, links." },
  ophanghoogte_midden: { label: "Ophanghoogte midden", hint: "Van het ophangpunt tot de vloer, in het midden." },
  ophanghoogte_rechts: { label: "Ophanghoogte rechts", hint: "Van het ophangpunt tot de vloer, rechts. Vloeren lopen vaak niet waterpas." },
};

export const CHECK_KEYS = ["grepen", "vensterbank", "radiator", "ventilatierooster", "raam_openen"] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];

export const CHECK_INFO: Record<CheckKey, { question: string; why: string }> = {
  grepen: { question: "Steken er raamgrepen of klinken uit?", why: "Een greep kan een rolgordijn, plissé of jaloezie in de dag raken." },
  vensterbank: { question: "Is er een vensterbank die uitsteekt of in de weg zit?", why: "Bepaalt waar het product kan eindigen." },
  radiator: { question: "Staat er een radiator of convector onder of naast het raam?", why: "Stof of lamellen mogen de warmteafgifte niet blokkeren." },
  ventilatierooster: { question: "Zit er een ventilatierooster in of boven het kozijn?", why: "Het rooster moet vrij blijven en kan montage boven in de dag hinderen." },
  raam_openen: { question: "Moet het raam kunnen openen of kantelen terwijl het product hangt?", why: "Een draai-kiepraam kan tegen het product slaan." },
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Gebruik JJJJ-MM-DD");

const roundingSchema = z.object({
  stepMm: z.number().int().positive(),
  mode: z.enum(["down", "up", "nearest"]),
});

const dimensionFormula = z.object({
  /** Never "average": a spread between points must be handled by the rule, not smoothed away. */
  basis: z.enum(["min", "max"]),
  of: z.array(z.enum(MEASURE_KEYS)).min(1),
  adjustMm: z.number().int(),
});

export const conversionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("formula"), width: dimensionFormula, height: dimensionFormula, rounding: roundingSchema }),
]);

/**
 * A versioned measuring rule. `protocol` rules only say what to measure (generic guidance, no order sizes).
 * `supplier` rules come from a named supplier's official measuring instructions and may convert raw
 * measurements to order sizes. A supplier rule without a source URL is rejected.
 */
export const measurementRuleSetSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    version: z.string().min(1).max(20),
    date: isoDate,
    kind: z.enum(["protocol", "supplier"]),
    title: z.string().min(3).max(120),
    productFamilies: z.array(z.enum(PRODUCT_FAMILIES)).min(1),
    mounting: z.enum(MOUNTINGS),
    manufacturer: z.string().max(80).optional(),
    collection: z.string().max(80).optional(),
    source: z.object({ label: z.string().min(3).max(200), url: z.url().optional(), retrievedAt: isoDate.optional() }),
    required: z.array(z.enum(MEASURE_KEYS)).min(1),
    optional: z.array(z.enum(MEASURE_KEYS)),
    /** Warning threshold for the spread between measuring points of one group, per group, in mm. */
    toleranceMm: z.object({ breedte: z.number().nonnegative(), hoogte: z.number().nonnegative(), ophanghoogte: z.number().nonnegative() }),
    checks: z.array(z.enum(CHECK_KEYS)),
    /** Minimum depth of the recess for this product; only a supplier can state this. */
    minDepthMm: z.number().int().positive().nullable(),
    conversion: conversionSchema,
    warnings: z.array(z.string().max(300)),
    supplierCheckRequired: z.array(z.string().max(300)),
  })
  .superRefine((rule, ctx) => {
    if (rule.kind === "supplier") {
      if (!rule.source.url) ctx.addIssue({ code: "custom", message: "Een leveranciersregel heeft een bron-URL nodig.", path: ["source", "url"] });
      if (!rule.manufacturer) ctx.addIssue({ code: "custom", message: "Een leveranciersregel noemt de fabrikant.", path: ["manufacturer"] });
      if (!rule.source.retrievedAt) ctx.addIssue({ code: "custom", message: "Leg vast wanneer de bron is geraadpleegd.", path: ["source", "retrievedAt"] });
    }
    if (rule.kind === "protocol") {
      if (rule.conversion.kind !== "none") ctx.addIssue({ code: "custom", message: "Een algemeen protocol rekent geen bestelmaten uit.", path: ["conversion"] });
      if (rule.minDepthMm !== null) ctx.addIssue({ code: "custom", message: "Een minimale diepte is productspecifiek.", path: ["minDepthMm"] });
    }
    if (rule.conversion.kind === "formula") {
      for (const key of [...rule.conversion.width.of, ...rule.conversion.height.of]) {
        if (!rule.required.includes(key)) ctx.addIssue({ code: "custom", message: `Formule gebruikt ${key}, maar die maat is niet verplicht.`, path: ["conversion"] });
      }
    }
  });

export type MeasurementRuleSet = z.infer<typeof measurementRuleSetSchema>;
