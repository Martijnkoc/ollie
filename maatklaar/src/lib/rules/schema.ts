import { z } from "zod";
import { CHECK_KEYS, MEASURE_KEYS, PRODUCT_FAMILIES, type Mounting } from "@/lib/measurements/schema";

/**
 * Versioned product rules: what to measure for a product, variant and mounting, how a supplier turns those
 * measurements into an order size, and which cases the source leaves open. A rule is data with a source;
 * the engine (engine.ts) only applies what a record states. Every record has tests with expected results
 * (tests/rules.test.ts, tests/golden/rules.json).
 */
export const MOUNT_TYPES = [
  "in_day",
  "on_day",
  "ceiling",
  "wall",
  "screwless",
  "roof_window",
  "shutter_front",
  "shutter_built_in",
] as const;
export type MountType = (typeof MOUNT_TYPES)[number];

/** The mounting choice in a window card and its mount type. */
export const MOUNT_OF: Record<Mounting, MountType | null> = {
  "in-de-dag": "in_day",
  "op-de-dag": "on_day",
  plafond: "ceiling",
  wand: "wall",
  schroefloos: "screwless",
  dakraam: "roof_window",
  voorzet: "shutter_front",
  inbouw: "shutter_built_in",
  onbekend: null,
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Gebruik JJJJ-MM-DD");
const measureKey = z.enum(MEASURE_KEYS);
/** Answers that are not lengths: a choice or a short text (e.g. the code on a roof window's plate). */
export const ANSWER_KEYS = ["bevestiging", "dakraam_code", "eindpunt", "ophanging", "nieuwe_rail"] as const;
export type AnswerKey = (typeof ANSWER_KEYS)[number];

export const ANSWER_INFO: Record<AnswerKey, { label: string; hint: string; options?: Record<string, string> }> = {
  bevestiging: {
    label: "Bevestiging in de dag",
    hint: "Komen de steunen boven in de dag (plafond) of tegen de achterkant of zijkant (wand)?",
    options: { plafond: "Boven in de dag (plafond)", wand: "Tegen de wand of het kozijn" },
  },
  dakraam_code: {
    label: "Fabrikant en typecode van het dakraam",
    hint: "Staat op het typeplaatje, meestal bovenin het raam als je het openzet. Neem merk en code letterlijk over.",
  },
  eindpunt: {
    label: "Tot waar moet het gordijn hangen?",
    hint: "De lengte hangt af van waar het gordijn eindigt.",
    options: { vloer: "Tot op de vloer", vensterbank: "Tot de vensterbank", onder_vensterbank: "Tot onder de vensterbank" },
  },
  ophanging: {
    label: "Hoe hang je het gordijn op?",
    hint: "Bepaalt vanaf waar je de lengte meet.",
    options: { rail: "Aan een rail (runners of haken)", ringen: "Met ringen aan een roede" },
  },
  nieuwe_rail: {
    label: "Komt er een nieuwe rail of roede?",
    hint: "Bij een nieuwe rail bepaal je zelf hoe breed en hoe hoog hij komt.",
    options: { ja: "Ja, een nieuwe", nee: "Nee, er hangt er al een" },
  },
};

export const inputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("mm"),
    key: measureKey,
    required: z.boolean(),
    /** Only asked when a check is answered this way (e.g. the width between tiles when there are tiles). */
    when: z.object({ check: z.enum(CHECK_KEYS), equals: z.boolean() }).optional(),
  }),
  z.object({ kind: z.literal("answer"), key: z.enum(ANSWER_KEYS), required: z.boolean() }),
]);
export type RuleInput = z.infer<typeof inputSchema>;

export const selectorSchema = z.discriminatedUnion("kind", [
  /** The smallest of these measurements (never an average). */
  z.object({ kind: z.literal("minimum"), of: z.array(measureKey).min(1) }),
  z.object({ kind: z.literal("maximum"), of: z.array(measureKey).min(1) }),
  /** One specific measuring position, e.g. the top width. */
  z.object({ kind: z.literal("position"), key: measureKey }),
  /** A size the user chose (rail length, desired outer size). */
  z.object({ kind: z.literal("chosen"), key: measureKey }),
  /** The source does not say which measurement to use: a question for the user or supplier. */
  z.object({ kind: z.literal("unspecified"), question: z.string().min(10).max(300) }),
  /** No size: the product is ordered by type or code. */
  z.object({ kind: z.literal("by_code"), key: z.enum(ANSWER_KEYS) }),
]);
export type Selector = z.infer<typeof selectorSchema>;

export const productRuleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    source: z.object({
      supplier: z.string().min(2).max(60),
      title: z.string().min(3).max(120),
      url: z.url().nullable(),
      /** When a person last compared this record with the full source. Null: never. */
      checkedOn: isoDate.nullable(),
      /** Version of the rule set; a changed record always gets a new version. */
      rulesVersion: z.string().regex(/^\d{4}\.\d+$/),
      /** concept: summarised, not yet checked against the full source; never yields a final order size. */
      status: z.enum(["concept", "published"]),
      notes: z.string().max(600),
    }),
    families: z.array(z.enum(PRODUCT_FAMILIES)).min(1),
    /** Product variant within the family (e.g. "hout-50" for wooden blinds with 50 mm slats); "" = all. */
    variant: z.string().max(40),
    variantLabel: z.string().max(80),
    mount: z.enum(MOUNT_TYPES),
    title: z.string().min(3).max(140),
    supported: z.boolean(),
    unsupportedReason: z.string().max(300).nullable(),
    inputs: z.array(inputSchema),
    /** Checks (obstacles) to answer for this product; each is asked yes/no. */
    checks: z.array(z.enum(CHECK_KEYS)),
    selection: z.object({ width: selectorSchema, height: selectorSchema }).nullable(),
    depth: z
      .object({
        key: z.enum(["diepte", "kozijndiepte"]),
        /** Minimum depth in mm; null when the source gives none for this variant (asked, not assumed). */
        minMm: z.number().int().positive().nullable(),
        /** Minimum depth per answer, e.g. per fixing: { bevestiging: { plafond: 50, wand: 70 } }. */
        byAnswer: z.object({ key: z.enum(ANSWER_KEYS), values: z.record(z.string(), z.number().int().positive()) }).nullable(),
        straight: z.boolean(),
      })
      .nullable(),
    /** Narrowest passage, e.g. between tiles: compare the top width with the narrow width. */
    narrowest: z
      .object({
        when: z.enum(CHECK_KEYS),
        wide: measureKey,
        narrow: measureKey,
        thresholdMm: z.number().int().positive(),
        /** Below the threshold the wide measurement counts, above it the narrow one; equal is undecided. */
      })
      .nullable(),
    /** Overlap on or around the opening (mm); "guideline" is advice, "minimum" is a hard check. */
    overlap: z
      .object({
        kind: z.enum(["guideline", "minimum"]),
        topMm: z.number().int().nonnegative().nullable(),
        sidesMm: z.number().int().nonnegative().nullable(),
        bottomMm: z.number().int().nonnegative().nullable(),
      })
      .nullable(),
    /** Deductions from the selected size and who applies them. Applied by us only when appliedBy is "maatklaar". */
    deductions: z
      .object({
        widthMm: z.number().int().nonnegative(),
        heightMm: z.number().int().nonnegative(),
        appliedBy: z.enum(["leverancier", "maatklaar"]),
      })
      .nullable(),
    supplierMakesDeduction: z.boolean(),
    /** Something the supplier adds itself (e.g. 30 mm for rings on a rod): recorded, never added again by us. */
    supplierAdds: z.object({ heightMm: z.number().int().positive(), when: z.string().max(200) }).nullable(),
    /** Rounding of the order size; null when the source gives none (we do not round). */
    rounding: z.object({ stepMm: z.number().int().positive(), mode: z.enum(["down", "up", "nearest"]) }).nullable(),
    limits: z
      .object({
        widthMm: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }).nullable(),
        heightMm: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }).nullable(),
      })
      .nullable(),
    /** Cases the source leaves open or contradicts: always asked, never decided by us. */
    ambiguous: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), question: z.string().min(10).max(300) })),
    /** Plain-language notes shown with the rule (own wording, no copied supplier text). */
    notes: z.array(z.string().max(300)),
  })
  .superRefine((r, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });
    if (r.source.status === "published" && (!r.source.checkedOn || (!r.id.startsWith("protocol-") && !r.source.url)))
      issue("Een gepubliceerde regel heeft een bron-URL en een controledatum.", ["source"]);
    if (!r.supported && !r.unsupportedReason) issue("Zeg waarom dit niet ondersteund wordt.", ["unsupportedReason"]);
    if (r.supplierMakesDeduction && r.deductions?.appliedBy === "maatklaar")
      issue("Een aftrek die de leverancier zelf doet, mogen wij niet nog eens toepassen.", ["deductions"]);
    if (r.deductions && r.deductions.appliedBy === "leverancier" && !r.supplierMakesDeduction)
      issue("Aftrek door de leverancier: zet supplierMakesDeduction.", ["supplierMakesDeduction"]);
    const asked = new Set(r.inputs.filter((i) => i.kind === "mm").map((i) => i.key));
    const used = (s: Selector) =>
      s.kind === "minimum" || s.kind === "maximum" ? s.of : s.kind === "position" || s.kind === "chosen" ? [s.key] : [];
    for (const s of r.selection ? [r.selection.width, r.selection.height] : [])
      for (const k of used(s)) if (!asked.has(k)) issue(`De selectie gebruikt ${k}, maar die maat wordt niet gevraagd.`, ["selection"]);
    if (r.narrowest && (!asked.has(r.narrowest.wide) || !asked.has(r.narrowest.narrow)))
      issue("De smalste-doorgangregel gebruikt een maat die niet wordt gevraagd.", ["narrowest"]);
    if (r.depth && !asked.has(r.depth.key)) issue("De diepte-eis gebruikt een maat die niet wordt gevraagd.", ["depth"]);
  });

export type ProductRule = z.infer<typeof productRuleSchema>;
