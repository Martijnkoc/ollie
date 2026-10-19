import { z } from "zod";
import { MEASURE_KEYS, type MeasureKey, type MeasurementRuleSet } from "./schema";
import { SCANTAG_ACCEPTANCE } from "@/config/scantag";
import { VALIDATION_STATUSES, type ValidationStatus } from "@/lib/rules/engine";
import { combine, measureInPlane, tooRough, type Combined, type Marked, type ReferenceKind, type Shape } from "./photo";
import type { ProductFamily } from "./schema";

/**
 * Measuring with the camera instead of a tape measure. Each task is one kind of photo: what to place where,
 * which points to tap, and which measurement every result becomes. The reference always lies in the plane
 * of what is measured, because a reference in another plane (an A4 sheet on the glass while measuring the
 * wall opening) scales everything wrongly.
 */
export const CAMERA_TARGETS = [...MEASURE_KEYS, "plafondhoogte"] as const;
export type CameraTarget = (typeof CAMERA_TARGETS)[number];

export const CAMERA_TASK_IDS = ["opening", "gewenst", "ruimte_boven", "diepte", "rail", "ophang", "plafond"] as const;
export type CameraTaskId = (typeof CAMERA_TASK_IDS)[number];

export type CameraTask = {
  id: CameraTaskId;
  title: string;
  reference: ReferenceKind;
  /** How many references: two on opposite sides pin down the perspective of a large surface. */
  references: 1 | 2;
  shape: Shape;
  /** Shown before the photo: where the reference goes and how to take the picture. */
  setup: string[];
  /** Label of every point, in tap order. */
  points: string[];
  /** The measurement each shape value becomes; null = not used. Rectangle: top, middle, bottom, left, middle, right. */
  targets: (CameraTarget | null)[];
  range: { minMm: number; maxMm: number };
};

const CORNERS = ["linksboven", "rechtsboven", "rechtsonder", "linksonder"];
const WALL =
  "Plak twee A4-vellen plat op de muur: één links en één rechts naast het raam (of linksboven en rechtsonder), in hetzelfde vlak als wat je meet. Rechtop of dwars maakt niet uit.";
const SHOOT =
  "Sta recht ervoor, met de gewone camera (1×, geen groothoek), en zet het vel en alles wat je meet helemaal in beeld. Hoe groter in beeld, hoe nauwkeuriger.";

export const CAMERA_TASKS: Record<CameraTaskId, CameraTask> = {
  opening: {
    id: "opening",
    title: "Raamopening (dag tot dag)",
    reference: "a4",
    references: 2,
    shape: { kind: "rect" },
    setup: [
      WALL,
      SHOOT,
      "Tik daarna de vier hoeken van de opening aan, op de voorkant van de muur: waar de muur overgaat in de dag. Onder is dat de bovenkant van de vensterbank.",
    ],
    points: CORNERS,
    targets: ["breedte_boven", "breedte_midden", "breedte_onder", "hoogte_links", "hoogte_midden", "hoogte_rechts"],
    range: { minMm: 100, maxMm: 6000 },
  },
  gewenst: {
    id: "gewenst",
    title: "Gewenste maat van je product",
    reference: "a4",
    references: 2,
    shape: { kind: "rect" },
    setup: [WALL, SHOOT, "Tik daarna de vier hoeken aan van waar je product moet komen, inclusief de overlap die je wilt."],
    points: CORNERS,
    targets: [null, "gewenste_breedte", null, null, "gewenste_hoogte", null],
    range: { minMm: 100, maxMm: 6000 },
  },
  ruimte_boven: {
    id: "ruimte_boven",
    title: "Vrije ruimte boven het raam",
    reference: "a4",
    references: 1,
    shape: { kind: "lines", count: 1 },
    setup: [
      "Plak een A4-vel plat op de muur boven of naast het raam.",
      SHOOT,
      "Tik de bovenkant van het kozijn of de opening aan, en recht daarboven het plafond of obstakel.",
    ],
    points: ["bovenkant kozijn of opening", "plafond of obstakel erboven"],
    targets: ["ruimte_boven"],
    range: { minMm: 10, maxMm: 3000 },
  },
  diepte: {
    id: "diepte",
    title: "Diepte van de dag",
    reference: "bankpas",
    references: 1,
    shape: { kind: "lines", count: 1 },
    setup: [
      "Leg een bankpas plat tegen de zijkant van de dag (met een stukje plakband), helemaal in dat vlak.",
      "Fotografeer schuin van voren zodat de zijkant van de dag en de pas goed te zien zijn, van dichtbij.",
      "Tik daarna de voorkant van de muur aan en, op dezelfde hoogte, het glas of de glaslat.",
    ],
    points: ["voorkant van de muur", "glas of glaslat"],
    targets: ["diepte"],
    range: { minMm: 10, maxMm: 1000 },
  },
  rail: {
    id: "rail",
    title: "Breedte van de rail of roede",
    reference: "a4",
    references: 2,
    shape: { kind: "lines", count: 1 },
    setup: [WALL, SHOOT, "Tik aan waar de rail links moet beginnen en rechts moet eindigen."],
    points: ["begin van de rail (links)", "einde van de rail (rechts)"],
    targets: ["rail_breedte"],
    range: { minMm: 200, maxMm: 10_000 },
  },
  ophang: {
    id: "ophang",
    title: "Ophanghoogte links, midden en rechts",
    reference: "a4",
    references: 2,
    shape: { kind: "lines", count: 3 },
    setup: [
      WALL,
      SHOOT + " Zorg dat de vloer en het ophangpunt allebei in beeld zijn.",
      "Tik per plek eerst het ophangpunt aan (onderkant rail of plafond) en dan de vloer recht daaronder.",
    ],
    points: ["ophangpunt links", "vloer links", "ophangpunt midden", "vloer midden", "ophangpunt rechts", "vloer rechts"],
    targets: ["ophanghoogte_links", "ophanghoogte_midden", "ophanghoogte_rechts"],
    range: { minMm: 300, maxMm: 6000 },
  },
  plafond: {
    id: "plafond",
    title: "Plafondhoogte",
    reference: "a4",
    references: 1,
    shape: { kind: "lines", count: 1 },
    setup: [
      "Plak een A4-vel plat op een muur, ongeveer op ooghoogte.",
      "Ga een paar meter van de muur staan, met de gewone camera (1×), zodat vloer, plafond en het vel in beeld zijn.",
      "Tik de vloer aan waar die de muur raakt, en recht daarboven het plafond.",
    ],
    points: ["vloer (tegen de muur)", "plafond (recht erboven)"],
    targets: ["plafondhoogte"],
    range: { minMm: 1500, maxMm: 6000 },
  },
};

/** The camera tasks that fill the measurements a rule asks for. */
export function tasksFor(rule: MeasurementRuleSet): CameraTask[] {
  const keys = new Set<MeasureKey>([...rule.required, ...rule.optional]);
  return CAMERA_TASK_IDS.map((id) => CAMERA_TASKS[id]).filter((t) => t.targets.some((k) => k !== null && keys.has(k as MeasureKey)));
}

const markedSchema = z.object({ x: z.number(), y: z.number(), sigma: z.number().nonnegative().max(100) });
const valueSchema = z.object({
  mm: z.number().positive(),
  randomMm: z.number().nonnegative(),
  systematicMm: z.number().nonnegative(),
  uncertaintyMm: z.number().int().nonnegative(),
});

/** One photo of one task: the tapped (and refined) points and what they measured. The photo stays on the device. */
export const cameraShotSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{6,24}$/),
  task: z.enum(CAMERA_TASK_IDS),
  takenAt: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  orientation: z.enum(["auto", "liggend", "staand"]),
  /** Corners of each reference, four per reference. */
  reference: z
    .array(markedSchema)
    .min(4)
    .max(8)
    .refine((r) => r.length % 4 === 0),
  points: z.array(markedSchema).max(8),
  /** Per point (reference first): moved onto an edge in the photo. */
  snapped: z.array(z.boolean()).max(12),
  /**
   * The measurements from this photo. Window measurements are filled in only once the server released them
   * after the payment; before that a shot holds geometry only.
   */
  values: z.partialRecord(z.enum(CAMERA_TARGETS), valueSchema).default({}),
  /** How the photo was taken: needed to debug and to validate per device type; no identifiers. */
  capture: z
    .object({
      method: z.enum(["camera-app", "browser-camera", "upload", "onbekend"]),
      device: z.enum(["mobiel", "desktop", "onbekend"]),
      browser: z.string().max(40),
    })
    .default({ method: "onbekend", device: "onbekend", browser: "" }),
  /** Photo checks on this device (blur, glare, reference size, viewing angle); blocking ones mean a new photo. */
  photoChecks: z
    .array(z.object({ blocking: z.boolean(), text: z.string().max(200) }))
    .max(10)
    .default([]),
  /** Processed by the server (ScanTag): its verdict merged with the photo checks. */
  processed: z.boolean().default(false),
  quality: z
    .object({ status: z.enum(["ok", "needs_more_data"]), issues: z.array(z.string().max(200)).max(10) })
    .default({ status: "ok", issues: [] }),
});
export type CameraShot = z.infer<typeof cameraShotSchema>;

/**
 * Where a window measurement came from, when it came from the camera (ScanTag). Absent: typed in by the user
 * (measurement method "handmatig"). The uncertainty is the combined margin at about 95 %: point positions
 * propagated through the fitted plane, plus the assumed systematic share (CAMERA_MEASURE).
 */
export const measureSourceSchema = z.object({
  method: z.literal("camera"),
  uncertaintyMm: z.number().int().nonnegative(),
  shots: z.number().int().positive(),
  /** The physical scale reference: an A4 sheet or a bank card (ISO/IEC 7810 ID-1). */
  scaleReference: z.enum(["a4", "bankpas"]).default("a4"),
  validation: z.enum(VALIDATION_STATUSES).default("not_validated"),
  capturedAt: z.string().default(""),
});
export type MeasureSource = z.infer<typeof measureSourceSchema>;

/** Measures one shot. The result is stored with the shot so that the report does not need the photo. */
export function measureShot(
  task: CameraTask,
  shot: { reference: Marked[]; points: Marked[]; orientation: "auto" | "liggend" | "staand" },
): { ok: true; values: CameraShot["values"] } | { ok: false; reason: string } {
  const quads = [0, 4].filter((i) => i < shot.reference.length).map((i) => shot.reference.slice(i, i + 4));
  const r = measureInPlane(quads, task.reference, task.shape, shot.points, { orientation: shot.orientation, ...task.range });
  if (!r.ok) return r;
  const values: CameraShot["values"] = {};
  task.targets.forEach((target, i) => {
    if (target) values[target] = { ...r.values[i]!, mm: Math.round(r.values[i]!.mm * 10) / 10 };
  });
  return { ok: true, values };
}

export type CameraResult = Combined & { target: CameraTarget; usable: boolean; reason: string | null };

/** Per measurement: all photos of it combined, and whether the result may be used. */
export function cameraResults(shots: readonly CameraShot[]): CameraResult[] {
  const out: CameraResult[] = [];
  for (const target of CAMERA_TARGETS) {
    // A photo that failed its quality checks never counts towards a measurement.
    const list = shots
      .filter((s) => s.quality.status === "ok")
      .map((s) => s.values[target])
      .filter((v): v is NonNullable<typeof v> => Boolean(v));
    const c = combine(list);
    if (!c) continue;
    const reason = !c.agree
      ? "De foto's verschillen meer dan hun foutmarge. Maak nog een foto of tik de punten opnieuw aan."
      : tooRough(c)
        ? "Te onnauwkeurig: kom dichterbij of zet het vel groter in beeld."
        : null;
    out.push({ ...c, target, usable: reason === null, reason });
  }
  return out;
}

/**
 * Writes the usable camera results into a window's measurements, for the keys its rule asks for. A value the
 * user typed in later wins: only keys without a value or with an earlier camera value are replaced.
 */
/**
 * Whether a camera measurement may count as validated for an order size: only for a rectangular window, within
 * the acceptance limit set for the product family after physical validation (none set yet).
 */
export function cameraValidation(
  family: ProductFamily,
  uncertaintyMm: number,
  shape: "rechthoek" | "erker" | "afwijkend",
): ValidationStatus {
  if (shape !== "rechthoek") return "unsupported";
  const limit = SCANTAG_ACCEPTANCE[family];
  return limit && uncertaintyMm <= limit.maxUncertaintyMm ? "validated" : "not_validated";
}

export function applyCameraToWindow<
  W extends {
    camera: CameraShot[];
    measures: Partial<Record<MeasureKey, number>>;
    sources: Partial<Record<MeasureKey, MeasureSource>>;
    confirmed: boolean;
    product: ProductFamily;
    shape?: "rechthoek" | "erker" | "afwijkend";
  },
>(w: W, rule: MeasurementRuleSet): W {
  const keys = new Set<MeasureKey>([...rule.required, ...rule.optional]);
  const measures = { ...w.measures };
  const sources = { ...w.sources };
  let changed = false;
  for (const r of cameraResults(w.camera)) {
    if (r.target === "plafondhoogte" || !keys.has(r.target)) continue;
    const key = r.target;
    if (measures[key] !== undefined && !sources[key]) continue;
    if (!r.usable) {
      if (sources[key]) {
        delete measures[key];
        delete sources[key];
        changed = true;
      }
      continue;
    }
    const mm = Math.round(r.mm);
    const used = w.camera.filter((s) => s.values[key]);
    const source: MeasureSource = {
      method: "camera",
      uncertaintyMm: r.uncertaintyMm,
      shots: r.shots,
      scaleReference: CAMERA_TASKS[used[0]!.task].reference,
      validation: cameraValidation(w.product, r.uncertaintyMm, w.shape ?? "rechthoek"),
      capturedAt:
        used
          .map((s) => s.takenAt)
          .sort()
          .at(-1) ?? "",
    };
    if (measures[key] !== mm || JSON.stringify(sources[key]) !== JSON.stringify(source)) changed = true;
    measures[key] = mm;
    sources[key] = source;
  }
  // Camera values whose photos were removed go as well.
  for (const key of Object.keys(sources) as MeasureKey[]) {
    if (!w.camera.some((s) => s.values[key])) {
      delete sources[key];
      delete measures[key];
      changed = true;
    }
  }
  return changed ? { ...w, measures, sources, confirmed: false } : w;
}

/** A camera ceiling height as the material inputs hold it: metres to the centimetre. */
export const ceilingHeightM = (mm: number) => Math.round(mm / 10) / 100;

export function newShotId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}
