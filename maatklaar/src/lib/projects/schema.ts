import { z } from "zod";
import { addressSchema, buildingSchema } from "@/lib/address/types";
import { CHECK_KEYS, MEASURE_KEYS, MOUNTINGS, PRODUCT_FAMILIES } from "@/lib/measurements/schema";

export const SCHEMA_VERSION = 1;

/** Where a value came from. */
export const SOURCES = ["pdf-tekst", "ocr", "gebruiker", "kalibratie", "schaalnotatie", "tekening", "berekening"] as const;
export type Source = (typeof SOURCES)[number];

/** Status of an input value: recognised by the computer, confirmed by the user, or missing. */
export const inputStatusSchema = z.enum(["auto", "confirmed", "missing"]);
export type InputStatus = z.infer<typeof inputStatusSchema>;

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

/** A real-world length in millimetres with its provenance. `mm` is null exactly when status is "missing". */
export const lengthSchema = z
  .object({
    mm: z.number().positive().finite().nullable(),
    status: inputStatusSchema,
    source: z.enum(SOURCES),
    /** The text the value was read from, e.g. "5.40 x 4.10". */
    sourceText: z.string().max(120).optional(),
  })
  .refine((l) => (l.mm === null) === (l.status === "missing"), "Een ontbrekende maat heeft geen waarde");
export type Length = z.infer<typeof lengthSchema>;

export const MISSING: Length = { mm: null, status: "missing", source: "gebruiker" };

export const roomShapeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rect"), length: lengthSchema, width: lengthSchema }),
  z.object({
    kind: z.literal("l"),
    length: lengthSchema,
    width: lengthSchema,
    notchLength: lengthSchema,
    notchWidth: lengthSchema,
    /** Which corner of the bounding rectangle is cut away. */
    corner: z.enum(["nw", "ne", "sw", "se"]),
  }),
  z.object({
    kind: z.literal("drawn"),
    page: z.number().int().nonnegative(),
    /** Corner points in page units; real lengths need the page scale. */
    points: z.array(pointSchema).max(200),
    status: z.enum(["auto", "confirmed"]),
  }),
  z.object({
    kind: z.literal("area"),
    /** Only a floor area is known (e.g. "22 m²" on the drawing); no shape, so no perimeter. */
    m2: z.number().positive().finite().nullable(),
    status: inputStatusSchema,
    source: z.enum(SOURCES),
    sourceText: z.string().max(120).optional(),
  }),
]);
export type RoomShape = z.infer<typeof roomShapeSchema>;

export const obstacleSchema = z.object({
  id: z.string(),
  name: z.string().max(60),
  length: lengthSchema,
  width: lengthSchema,
  /** Plinths around a column or chimney breast. */
  plinthAround: z.boolean(),
});
export type Obstacle = z.infer<typeof obstacleSchema>;

export const doorSchema = z.object({
  id: z.string(),
  /** Index of the wall (edge) the opening is in. */
  wall: z.number().int().nonnegative(),
  width: lengthSchema,
});
export type Door = z.infer<typeof doorSchema>;

export const roomSchema = z.object({
  id: z.string(),
  /** May be empty while the user types; shown as "Naamloze ruimte" then. */
  name: z.string().max(60),
  nameStatus: z.enum(["auto", "confirmed"]),
  origin: z.enum(["auto", "manual"]),
  /** Plan page the room belongs to, and where its label sits (page units). */
  page: z.number().int().nonnegative().nullable(),
  anchor: pointSchema.nullable(),
  shape: roomShapeSchema,
  obstacles: z.array(obstacleSchema).max(20),
  includeFloor: z.boolean(),
  includePlinth: z.boolean(),
  /** Per wall (edge index): false = no plinth here (built-in cupboard, kitchen units …). Missing = plinth. */
  wallsWithoutPlinth: z.array(z.number().int().nonnegative()).max(200),
  doors: z.array(doorSchema).max(20),
  /** Notes from the analysis, e.g. "Vorm aangenomen als rechthoek". */
  notes: z.array(z.string().max(300)).max(10),
});
export type Room = z.infer<typeof roomSchema>;

export const scaleSchema = z.object({
  page: z.number().int().nonnegative(),
  mmPerUnit: z.number().positive().finite(),
  method: z.enum(["kalibratie", "schaalnotatie"]),
  status: z.enum(["auto", "confirmed"]),
  reference: z.object({ a: pointSchema, b: pointSchema, realMm: z.number().positive() }).nullable(),
  notation: z.number().int().positive().nullable(),
});
export type Scale = z.infer<typeof scaleSchema>;

export const pageInfoSchema = z.object({
  index: z.number().int().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(["pt", "px"]),
  /** User label, e.g. "Begane grond". */
  label: z.string().max(40),
});

export const documentSchema = z.object({
  kind: z.enum(["pdf", "png", "jpeg", "webp"]),
  sizeBytes: z.number().int().positive(),
  /** Kept on this device only; never sent anywhere or printed in the report. */
  fileName: z.string().max(200),
  pages: z.array(pageInfoSchema).min(1),
  selectedPage: z.number().int().nonnegative(),
  storedOnDevice: z.boolean(),
});
export type PlanDocument = z.infer<typeof documentSchema>;

export const analysisSchema = z.object({
  page: z.number().int().nonnegative(),
  method: z.enum(["pdf-tekst", "ocr"]),
  ranAt: z.string(),
  quality: z.enum(["goed", "matig", "onvoldoende"]),
  reasons: z.array(z.string().max(300)),
  meanConfidence: z.number().nullable(),
  counts: z.object({ textItems: z.number().int(), roomNames: z.number().int(), dimensionLabels: z.number().int(), areaLabels: z.number().int() }),
  scaleNotation: z.object({ denominator: z.number().int().positive(), text: z.string().max(60) }).nullable(),
  notToScale: z.boolean(),
  findings: z.array(z.string().max(300)),
  /** Single length labels with their position, offered as suggestions when calibrating. */
  lengthLabels: z
    .array(z.object({ mm: z.number().positive().nullable(), text: z.string().max(40), box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }) }))
    .max(300),
});
export type PageAnalysis = z.infer<typeof analysisSchema>;

export const windowSchema = z.object({
  id: z.string(),
  code: z.string().regex(/^R\d{2,3}$/),
  label: z.string().max(60),
  roomId: z.string().nullable(),
  page: z.number().int().nonnegative().nullable(),
  position: pointSchema.nullable(),
  origin: z.enum(["auto", "manual"]),
  note: z.string().max(500),
  windowType: z.string().max(60),
  product: z.enum(PRODUCT_FAMILIES),
  mounting: z.enum(MOUNTINGS),
  ruleId: z.string(),
  measures: z.partialRecord(z.enum(MEASURE_KEYS), z.number().int().positive().max(100_000)),
  measureSource: z.enum(["gebruiker", "tekening", "scan", "anders"]),
  checks: z.partialRecord(z.enum(CHECK_KEYS), z.boolean()),
  deviationAcknowledged: z.boolean(),
  confirmed: z.boolean(),
  fullness: z.number().positive().max(5).nullable(),
});
export type ProjectWindow = z.infer<typeof windowSchema>;

export const paymentSchema = z.object({
  orderId: z.string(),
  orderSecret: z.string(),
  status: z.enum(["open", "pending", "paid", "failed", "canceled", "expired", "refunded"]),
  mode: z.enum(["live", "test", "demo"]),
  checkedAt: z.string(),
});
export type ProjectPayment = z.infer<typeof paymentSchema>;

export const projectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().regex(/^[a-z0-9]{12,40}$/),
  name: z.string().min(1).max(80),
  createdAt: z.string(),
  updatedAt: z.string(),
  address: addressSchema.nullable(),
  building: buildingSchema.nullable(),
  document: documentSchema.nullable(),
  analyses: z.array(analysisSchema),
  scales: z.array(scaleSchema),
  rooms: z.array(roomSchema).max(100),
  windows: z.array(windowSchema).max(200),
  floor: z.object({
    pattern: z.string(),
    wastePercent: z.number().min(0).max(50),
    /** m² per pack, only when the user entered it from the product they chose. */
    packM2: z.number().positive().max(100).nullable(),
    productNote: z.string().max(120),
  }),
  plinth: z.object({
    marginPercent: z.number().min(0).max(50),
    /** Available piece length in mm, only when the user entered it. */
    pieceLengthMm: z.number().int().positive().max(10_000).nullable(),
  }),
  payment: paymentSchema.nullable(),
  report: z.object({ includeAddress: z.boolean() }),
});
export type Project = z.infer<typeof projectSchema>;
