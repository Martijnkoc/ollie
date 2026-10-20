import { z } from "zod";
import { scanCriteria, type ScanCriteria } from "@/config/scantag";
import {
  angleDeg,
  bestCaseUncertaintyMm,
  combine,
  cross,
  distMm,
  dot,
  lengthValue,
  midpoint,
  norm,
  planeOf,
  pointSigmaMm,
  projectOnPlane,
  sub,
  unit,
  type Combined,
  type ScanValue,
} from "./ar-geometry";
import {
  MEASURE_KEYS,
  MOUNTINGS,
  PRODUCT_FAMILIES,
  type MeasureKey,
  type MeasurementRuleSet,
  type Mounting,
  type ProductFamily,
} from "./schema";

/**
 * ScanTag: measuring windows with the phone's AR tracking instead of a tape measure. Each task is one short
 * guided capture: aim the cross-hair at a corner or edge, hold still, and the phone records where in 3D space it
 * hit a real surface. The scale comes from the device's motion tracking (WebXR hit-test), never from a printed
 * sheet, the plan, the BAG or a picture. Without that tracking there is no camera measurement.
 */
export const SCAN_TARGETS = [...MEASURE_KEYS, "plafondhoogte"] as const;
export type ScanTarget = (typeof SCAN_TARGETS)[number];

export const SCAN_TASK_IDS = ["opening", "gewenst", "ruimte_boven", "diepte", "rail", "ophang", "plafond"] as const;
export type ScanTaskId = (typeof SCAN_TASK_IDS)[number];

export const WINDOW_SHAPES = ["rechthoek", "erker", "afwijkend"] as const;
export type WindowShape = (typeof WINDOW_SHAPES)[number];

export type ScanTask = {
  id: ScanTaskId;
  title: string;
  /** rect: four corners; pairs: start and end point per length; depth: wall face, then frame or glass. */
  kind: "rect" | "pairs" | "depth";
  /** Short instructions shown before the capture. */
  steps: string[];
  /** Label of every point, in capture order. */
  points: string[];
  /** The measurement each value becomes. Rect: top, middle, bottom width; left, middle, right height. */
  targets: (ScanTarget | null)[];
  range: { minMm: number; maxMm: number };
};

const CORNERS = ["hoek linksboven", "hoek rechtsboven", "hoek rechtsonder", "hoek linksonder"];
const FIND_WALL = "Beweeg je telefoon rustig heen en weer tot het vizier groen wordt: dan heeft hij de muur gevonden.";
const HOLD = "Richt het vizier op het punt en tik op Vastleggen. Houd de telefoon even stil.";

export const SCAN_TASKS: Record<ScanTaskId, ScanTask> = {
  opening: {
    id: "opening",
    title: "Raamopening (dag tot dag)",
    kind: "rect",
    steps: [
      "Ga één tot twee meter voor het raam staan, met het hele raam in beeld.",
      FIND_WALL,
      "Leg de vier hoeken van de opening vast, op de voorkant van de muur: waar de muur overgaat in de dag. Onder is dat de bovenkant van de vensterbank.",
    ],
    points: CORNERS,
    targets: ["breedte_boven", "breedte_midden", "breedte_onder", "hoogte_links", "hoogte_midden", "hoogte_rechts"],
    range: { minMm: 100, maxMm: 6000 },
  },
  gewenst: {
    id: "gewenst",
    title: "Gewenste maat van je product",
    kind: "rect",
    steps: [
      "Ga één tot twee meter voor het raam staan.",
      FIND_WALL,
      "Leg de vier hoeken vast van waar je product moet komen, inclusief de overlap die je wilt.",
    ],
    points: CORNERS,
    targets: [null, "gewenste_breedte", null, null, "gewenste_hoogte", null],
    range: { minMm: 100, maxMm: 6000 },
  },
  ruimte_boven: {
    id: "ruimte_boven",
    title: "Vrije ruimte boven het raam",
    kind: "pairs",
    steps: [FIND_WALL, "Leg de bovenkant van het kozijn of de opening vast, en recht daarboven het plafond of obstakel."],
    points: ["bovenkant kozijn of opening", "plafond of obstakel erboven"],
    targets: ["ruimte_boven"],
    range: { minMm: 10, maxMm: 3000 },
  },
  diepte: {
    id: "diepte",
    title: "Diepte van de dag",
    kind: "depth",
    steps: [
      "Sta schuin voor het raam, dichtbij, zodat je de zijkant van de dag ziet.",
      "Leg eerst een punt vast op de voorkant van de muur, vlak naast de dag.",
      "Leg daarna, op dezelfde hoogte, het kozijn of de glaslat vast.",
    ],
    points: ["voorkant van de muur", "kozijn of glaslat"],
    targets: ["diepte"],
    range: { minMm: 10, maxMm: 1000 },
  },
  rail: {
    id: "rail",
    title: "Breedte van de rail of roede",
    kind: "pairs",
    steps: [FIND_WALL, "Leg vast waar de rail links moet beginnen en rechts moet eindigen."],
    points: ["begin van de rail (links)", "einde van de rail (rechts)"],
    targets: ["rail_breedte"],
    range: { minMm: 200, maxMm: 10_000 },
  },
  ophang: {
    id: "ophang",
    title: "Ophanghoogte links, midden en rechts",
    kind: "pairs",
    steps: [
      "Ga een paar meter terug zodat de vloer en het ophangpunt in beeld zijn.",
      FIND_WALL,
      "Leg per plek eerst het ophangpunt vast (onderkant rail of plafond) en dan de vloer recht daaronder.",
    ],
    points: ["ophangpunt links", "vloer links", "ophangpunt midden", "vloer midden", "ophangpunt rechts", "vloer rechts"],
    targets: ["ophanghoogte_links", "ophanghoogte_midden", "ophanghoogte_rechts"],
    range: { minMm: 300, maxMm: 6000 },
  },
  plafond: {
    id: "plafond",
    title: "Plafondhoogte",
    kind: "pairs",
    steps: [
      "Ga een paar meter van een muur staan, zodat vloer en plafond in beeld zijn.",
      FIND_WALL,
      "Leg de vloer vast waar die de muur raakt, en recht daarboven het plafond.",
    ],
    points: ["vloer (tegen de muur)", "plafond (recht erboven)"],
    targets: ["plafondhoogte"],
    range: { minMm: 1500, maxMm: 6000 },
  },
};

/** The scan tasks that fill the measurements a rule asks for. */
export function tasksFor(rule: MeasurementRuleSet): ScanTask[] {
  const keys = new Set<MeasureKey>([...rule.required, ...rule.optional]);
  return SCAN_TASK_IDS.map((id) => SCAN_TASKS[id]).filter((t) => t.targets.some((k) => k !== null && keys.has(k as MeasureKey)));
}

// ---------------------------------------------------------------------------------------------------------
// Statuses and reasons

/** The verdict on one measurement. Only `accepted` may count towards an order size. */
export const SCAN_STATUSES = ["accepted", "retake_required", "not_supported_for_ordering"] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const SCAN_STATUS_LABELS: Record<ScanStatus, string> = {
  accepted: "Geaccepteerd voor bestellen",
  retake_required: "Opnieuw scannen",
  not_supported_for_ordering: "Niet geschikt om op te bestellen",
};

export const SCAN_REASONS = {
  no_metric_scale:
    "Deze browser of dit toestel geeft geen metrische AR-tracking (WebXR). Zonder betrouwbare schaal meten we niet in millimeters.",
  surface_not_found: "Niet alle punten zijn vastgelegd. Beweeg rustig heen en weer tot het vizier groen is.",
  tracking_lost: "De telefoon raakte zijn positie kwijt tijdens de opname. Beweeg langzamer en houd het raam in beeld.",
  too_few_frames: "Een punt is te kort vastgehouden. Houd de telefoon stil tot het punt vastligt.",
  unstable_point: "Een punt lag niet stil: de telefoon bewoog, of het vizier viel op glas of een rand. Scan opnieuw.",
  depth_disagrees: "De afstand en de dieptekaart van je toestel spreken elkaar tegen (schittering of glas?). Scan opnieuw.",
  not_planar: "De hoeken liggen niet in één vlak: waarschijnlijk viel een punt op het glas of de vensterbank. Leg de hoeken opnieuw vast.",
  not_rectangular: "De hoeken vormen geen rechthoek: een hoek ligt waarschijnlijk naast de rand. Leg de hoeken opnieuw vast.",
  depth_not_found: "Het kozijn of glas is niet gevonden: het punt viel op de muur. Richt op het kozijn en houd stil.",
  not_straight_back: "Meet de diepte recht naar achteren, op dezelfde hoogte als het eerste punt.",
  out_of_range: "Deze maat past niet bij deze opname. Leg de punten opnieuw vast.",
  shots_disagree: "Twee scans van dezelfde maat verschillen meer dan hun foutmarge. Scan nog een keer.",
  come_closer: "Te onnauwkeurig voor dit product op deze afstand. Ga dichterbij staan en scan opnieuw.",
  sensor_too_coarse: "Deze sensor is voor dit product niet nauwkeurig genoeg, ook niet van dichtbij.",
  shape_unsupported: "ScanTag meet alleen rechthoekige ramen; deze vorm meet je volgens de instructie van je leverancier.",
  criteria_not_validated:
    "ScanTag is voor dit product nog niet gevalideerd tegen een gekalibreerde meting: je krijgt de gemeten maat met foutmarge, nog geen bestelmaat.",
} as const;
export type ScanReason = keyof typeof SCAN_REASONS;
export const SCAN_REASON_CODES = Object.keys(SCAN_REASONS) as [ScanReason, ...ScanReason[]];

// ---------------------------------------------------------------------------------------------------------
// Stored data

const coord = z.number().finite().min(-100).max(100);
const vec3Schema = z.object({ x: coord, y: coord, z: coord });

/** One captured point: the mean of its hit positions over the frames (metres, session space). */
export const scanPointSchema = z.object({
  p: vec3Schema,
  /** Normal of the surface that was hit, when the device reports it. */
  n: vec3Schema.nullable(),
  /** RMS distance of the frame hits from their mean (mm). */
  spreadMm: z.number().finite().nonnegative().max(10_000),
  frames: z.number().int().nonnegative().max(1000),
  /** Distance from the phone to the point (m). */
  rangeM: z.number().finite().nonnegative().max(50),
  /** Median difference between hit distance and the device depth map (mm), when the device has one. */
  depthDiffMm: z.number().finite().nonnegative().max(100_000).nullable(),
});
export type ScanPoint = z.infer<typeof scanPointSchema>;

/** What the browser offered for this scan; detected at runtime, never assumed. No identifiers. */
export const deviceSchema = z.object({
  webxr: z.boolean(),
  hitTest: z.boolean(),
  depthSensing: z.boolean(),
  domOverlay: z.boolean(),
  platform: z.enum(["android", "ios", "desktop", "onbekend"]),
  browser: z.string().max(40),
});
export type DeviceInfo = z.infer<typeof deviceSchema>;

const valueSchema = z.object({
  mm: z.number().finite().positive(),
  randomMm: z.number().finite().nonnegative(),
  systematicMm: z.number().finite().nonnegative(),
  uncertaintyMm: z.number().finite().nonnegative(),
});

/** The geometry of one scan, as the device sends it to the server: points, tracking, device. No image. */
export const scanInputSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{6,24}$/),
  task: z.enum(SCAN_TASK_IDS),
  points: z.array(scanPointSchema).max(6),
  tracking: z.object({ frames: z.number().int().nonnegative().max(1_000_000), lost: z.number().int().nonnegative().max(1_000_000) }),
  device: deviceSchema,
});
export type ScanInput = z.infer<typeof scanInputSchema>;

/**
 * One scan of one task. `values` is filled only once the server released the measurements after a verified
 * payment (or, for the home's ceiling height, which is free, on the device).
 */
export const scanShotSchema = scanInputSchema.extend({
  takenAt: z.string(),
  values: z.partialRecord(z.enum(SCAN_TARGETS), valueSchema).default({}),
  processed: z.boolean().default(false),
  quality: z
    .object({ status: z.enum(["ok", "retake_required"]), reasons: z.array(z.enum(SCAN_REASON_CODES)).max(10) })
    .default({ status: "ok", reasons: [] }),
});
export type ScanShot = z.infer<typeof scanShotSchema>;

/** The server's verdict per measurement of a window, without any size: what may be shown before payment. */
export const targetVerdictSchema = z.object({
  status: z.enum(SCAN_STATUSES),
  reasons: z.array(z.enum(SCAN_REASON_CODES)).max(10),
  shots: z.number().int().nonnegative(),
});
export type TargetVerdict = z.infer<typeof targetVerdictSchema>;

/** For which product, mounting and shape the verdicts were given: a change asks the server again. */
export const verdictContextSchema = z.object({
  product: z.enum(PRODUCT_FAMILIES),
  mounting: z.enum(MOUNTINGS),
  shape: z.enum(WINDOW_SHAPES),
});
export type VerdictContext = z.infer<typeof verdictContextSchema>;

/**
 * Where a window measurement came from, when ScanTag measured it. A typed value has no entry. `rawMm` is the
 * unrounded value; `uncertaintyMm` the margin at about 95 % (point errors through the geometry plus the assumed
 * scale share of the tracking, see AR_MEASURE).
 */
export const measureSourceSchema = z.object({
  method: z.literal("scantag_ar"),
  scaleSource: z.enum(["webxr_hit_test", "webxr_hit_test_depth"]),
  rawMm: z.number().finite().positive(),
  uncertaintyMm: z.number().finite().nonnegative(),
  shots: z.number().int().positive(),
  status: z.enum(SCAN_STATUSES),
  reasons: z.array(z.enum(SCAN_REASON_CODES)).max(10),
  device: deviceSchema,
  capturedAt: z.string(),
});
export type MeasureSource = z.infer<typeof measureSourceSchema>;

/** One frame's hit while a point is held still. */
export type HitSample = {
  p: { x: number; y: number; z: number };
  n: { x: number; y: number; z: number } | null;
  rangeM: number;
  depthDiffMm: number | null;
};

/**
 * A captured point from the frames it was held for: mean position, how far the hits strayed from it (RMS, mm),
 * mean distance, mean normal and the median depth-map disagreement. Null without any hit.
 */
export function pointFromSamples(samples: readonly HitSample[]): ScanPoint | null {
  if (!samples.length) return null;
  const n = samples.length;
  const mean = (f: (s: HitSample) => number) => samples.reduce((a, s) => a + f(s), 0) / n;
  const p = { x: mean((s) => s.p.x), y: mean((s) => s.p.y), z: mean((s) => s.p.z) };
  const spreadMm = Math.sqrt(mean((s) => (s.p.x - p.x) ** 2 + (s.p.y - p.y) ** 2 + (s.p.z - p.z) ** 2)) * 1000;
  const normals = samples.map((s) => s.n).filter((v): v is NonNullable<typeof v> => Boolean(v));
  const nSum = normals.reduce((a, v) => ({ x: a.x + v.x, y: a.y + v.y, z: a.z + v.z }), { x: 0, y: 0, z: 0 });
  const nUnit = normals.length ? unit(nSum) : null;
  const diffs = samples
    .map((s) => s.depthDiffMm)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  return {
    p,
    n: nUnit,
    spreadMm,
    frames: n,
    rangeM: mean((s) => s.rangeM),
    depthDiffMm: diffs.length ? diffs[Math.floor(diffs.length / 2)]! : null,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Measuring

export type ShotGeometry = { planeResidualMm: number | null; maxCornerDeviationDeg: number | null; convex: boolean | null };

const pointsNeeded = (task: ScanTask) => task.points.length;

/** Measures one scan from its points. Pure: the same on the device and on the server. */
export function measureShot(
  task: ScanTask,
  points: readonly ScanPoint[],
):
  | { ok: true; values: Partial<Record<ScanTarget, ScanValue>>; geometry: ShotGeometry; reasons: ScanReason[] }
  | { ok: false; reasons: ScanReason[] } {
  if (points.length !== pointsNeeded(task)) return { ok: false, reasons: ["surface_not_found"] };
  const sigma = points.map(pointSigmaMm);
  const raw: (ScanValue | null)[] = [];
  const geometry: ShotGeometry = { planeResidualMm: null, maxCornerDeviationDeg: null, convex: null };
  const reasons: ScanReason[] = [];

  if (task.kind === "rect") {
    const plane = planeOf(points.map((p) => p.p));
    if (!plane) return { ok: false, reasons: ["not_rectangular"] };
    // Corners in capture order: top-left, top-right, bottom-right, bottom-left, projected onto their plane.
    const q = points.map((p) => projectOnPlane(p.p, plane));
    geometry.planeResidualMm = plane.residualMm;
    // Same turning direction at every corner: the corners were captured in order and form a convex shape.
    const turns = q.map((p, i) => dot(cross(sub(q[(i + 1) % 4]!, p), sub(q[(i + 2) % 4]!, q[(i + 1) % 4]!)), plane.normal));
    geometry.convex = turns.every((t) => t > 0) || turns.every((t) => t < 0);
    geometry.maxCornerDeviationDeg = Math.max(...q.map((p, i) => Math.abs(90 - angleDeg(q[(i + 3) % 4]!, p, q[(i + 1) % 4]!))));
    const extra = plane.residualMm / 2;
    const [s0, s1, s2, s3] = sigma as [number, number, number, number];
    // The middle is derived from the corners, not measured on its own: it gets the larger margin of the two edges.
    raw.push(
      lengthValue(distMm(q[0]!, q[1]!), [s0, s1, extra]),
      lengthValue(distMm(midpoint(q[0]!, q[3]!), midpoint(q[1]!, q[2]!)), [Math.max(s0, s3), Math.max(s1, s2), extra]),
      lengthValue(distMm(q[3]!, q[2]!), [s3, s2, extra]),
      lengthValue(distMm(q[0]!, q[3]!), [s0, s3, extra]),
      lengthValue(distMm(midpoint(q[0]!, q[1]!), midpoint(q[3]!, q[2]!)), [Math.max(s0, s1), Math.max(s3, s2), extra]),
      lengthValue(distMm(q[1]!, q[2]!), [s1, s2, extra]),
    );
  } else if (task.kind === "depth") {
    const [wall, frame] = points as [ScanPoint, ScanPoint];
    const d = sub(frame.p, wall.p);
    const n = wall.n ? unit(wall.n) : null;
    const lengthMm = norm(d) * 1000;
    // Along the wall's normal when the device reports it: a point slightly to the side does not add depth.
    const depthMm = n ? Math.abs(dot(d, n)) * 1000 : lengthMm;
    const lateralMm = Math.sqrt(Math.max(0, lengthMm ** 2 - depthMm ** 2));
    if (depthMm < 8) reasons.push("depth_not_found");
    else if (lateralMm > Math.max(100, depthMm)) reasons.push("not_straight_back");
    raw.push(reasons.length ? null : lengthValue(depthMm, [sigma[0]!, sigma[1]!]));
  } else {
    for (let i = 0; i + 1 < points.length; i += 2)
      raw.push(lengthValue(distMm(points[i]!.p, points[i + 1]!.p), [sigma[i]!, sigma[i + 1]!]));
  }

  const values: Partial<Record<ScanTarget, ScanValue>> = {};
  task.targets.forEach((target, i) => {
    const v = raw[i];
    if (!target || !v) return;
    if (v.mm < task.range.minMm || v.mm > task.range.maxMm) {
      if (!reasons.includes("out_of_range")) reasons.push("out_of_range");
      return;
    }
    values[target] = v;
  });
  return { ok: true, values, geometry, reasons };
}

/** Whether one scan is usable, from its own data: tracking, stillness, surfaces, shape. Product-independent. */
export function assessShot(task: ScanTask, shot: Pick<ScanInput, "points" | "tracking">, criteria: ScanCriteria) {
  const measured = measureShot(task, shot.points);
  const reasons = new Set<ScanReason>(measured.reasons);
  if (shot.tracking.frames > 0 && shot.tracking.lost / shot.tracking.frames > criteria.maxTrackingLoss) reasons.add("tracking_lost");
  if (shot.points.some((p) => p.frames < criteria.minFramesPerPoint)) reasons.add("too_few_frames");
  if (shot.points.some((p) => p.spreadMm > criteria.maxPointSpreadMm)) reasons.add("unstable_point");
  if (shot.points.some((p) => p.depthDiffMm !== null && p.depthDiffMm > criteria.maxDepthDisagreementMm)) reasons.add("depth_disagrees");
  if (measured.ok && task.kind === "rect") {
    const g = measured.geometry;
    if ((g.planeResidualMm ?? 0) > criteria.maxPlaneResidualMm) reasons.add("not_planar");
    if (g.convex === false || (g.maxCornerDeviationDeg ?? 0) > criteria.maxCornerAngleDeg) reasons.add("not_rectangular");
  }
  const list = [...reasons];
  return {
    status: list.length ? ("retake_required" as const) : ("ok" as const),
    reasons: list,
    values: measured.ok && !list.length ? measured.values : {},
  };
}

/** The same measurement from every usable scan, combined. */
export function combinedValues(shots: readonly Pick<ScanShot, "values" | "quality">[]): Partial<Record<ScanTarget, Combined>> {
  const out: Partial<Record<ScanTarget, Combined>> = {};
  for (const target of SCAN_TARGETS) {
    const list = shots
      .filter((s) => s.quality.status === "ok")
      .map((s) => s.values[target])
      .filter((v): v is ScanValue => Boolean(v));
    const c = combine(list);
    if (c) out[target] = c;
  }
  return out;
}

/** The verdict on one combined measurement for a product. Before validation nothing is `accepted`. */
export function verdictFor(
  target: ScanTarget,
  c: Combined,
  ctx: VerdictContext,
  criteria: ScanCriteria = scanCriteria(ctx.product, ctx.mounting),
): TargetVerdict {
  const verdict = (status: ScanStatus, reason: ScanReason): TargetVerdict => ({ status, reasons: [reason], shots: c.shots });
  if (ctx.shape !== "rechthoek" && target !== "plafondhoogte") return verdict("not_supported_for_ordering", "shape_unsupported");
  if (!c.agree) return verdict("retake_required", "shots_disagree");
  if (c.uncertaintyMm > criteria.maxUncertaintyMm)
    return bestCaseUncertaintyMm(c.mm) > criteria.maxUncertaintyMm
      ? verdict("not_supported_for_ordering", "sensor_too_coarse")
      : verdict("retake_required", "come_closer");
  if (!criteria.validated) return verdict("not_supported_for_ordering", "criteria_not_validated");
  return { status: "accepted", reasons: [], shots: c.shots };
}

/**
 * Verdicts for every measurement of a set of scans. A measurement whose only scans need a retake gets
 * `retake_required` with their reasons; one with a usable scan gets the verdict on the combined value.
 */
export function verdicts(
  shots: readonly (Pick<ScanShot, "task" | "quality"> & { values: Partial<Record<ScanTarget, ScanValue>> })[],
  ctx: VerdictContext,
  criteria: ScanCriteria = scanCriteria(ctx.product, ctx.mounting),
): Partial<Record<ScanTarget, TargetVerdict>> {
  const out: Partial<Record<ScanTarget, TargetVerdict>> = {};
  const combined = combinedValues(shots);
  for (const target of SCAN_TARGETS) {
    const tried = shots.filter((s) => SCAN_TASKS[s.task].targets.includes(target));
    if (!tried.length) continue;
    const c = combined[target];
    if (c) out[target] = verdictFor(target, c, ctx, criteria);
    else out[target] = { status: "retake_required", reasons: [...new Set(tried.flatMap((s) => s.quality.reasons))].slice(0, 10), shots: 0 };
  }
  return out;
}

/**
 * Writes released scan measurements into a window, for the keys its rule asks for. A value the user typed in
 * wins: only keys without a value or with an earlier scan value are replaced. Values stay unrounded.
 */
export function applyScanToWindow<
  W extends {
    scans: ScanShot[];
    measures: Partial<Record<MeasureKey, number>>;
    sources: Partial<Record<MeasureKey, MeasureSource>>;
    confirmed: boolean;
    product: ProductFamily;
    mounting: Mounting;
    shape: WindowShape;
  },
>(w: W, rule: MeasurementRuleSet): W {
  const keys = new Set<MeasureKey>([...rule.required, ...rule.optional]);
  const measures = { ...w.measures };
  const sources = { ...w.sources };
  const combined = combinedValues(w.scans);
  const ctx = { product: w.product, mounting: w.mounting, shape: w.shape };
  let changed = false;
  for (const [target, c] of Object.entries(combined) as [ScanTarget, Combined][]) {
    if (target === "plafondhoogte" || !keys.has(target)) continue;
    if (measures[target] !== undefined && !sources[target]) continue;
    const verdict = verdictFor(target, c, ctx);
    if (verdict.status === "retake_required") {
      if (sources[target]) {
        delete measures[target];
        delete sources[target];
        changed = true;
      }
      continue;
    }
    const used = w.scans.filter((s) => s.quality.status === "ok" && s.values[target]);
    const latest = used.reduce((a, b) => (a.takenAt > b.takenAt ? a : b));
    const source: MeasureSource = {
      method: "scantag_ar",
      scaleSource: used.some((s) => s.device.depthSensing) ? "webxr_hit_test_depth" : "webxr_hit_test",
      rawMm: c.mm,
      uncertaintyMm: c.uncertaintyMm,
      shots: c.shots,
      status: verdict.status,
      reasons: verdict.reasons,
      device: latest.device,
      capturedAt: latest.takenAt,
    };
    if (measures[target] !== c.mm || JSON.stringify(sources[target]) !== JSON.stringify(source)) changed = true;
    measures[target] = c.mm;
    sources[target] = source;
  }
  // Scan values whose scans were removed (or no longer apply to the rule) go as well.
  for (const key of Object.keys(sources) as MeasureKey[]) {
    if (!combined[key] || !keys.has(key)) {
      delete sources[key];
      delete measures[key];
      changed = true;
    }
  }
  return changed ? { ...w, measures, sources, confirmed: false } : w;
}

/** A ceiling height as the material inputs hold it: metres to the centimetre (paint, not window decoration). */
export const ceilingHeightM = (mm: number) => Math.round(mm / 10) / 100;

export function newShotId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

/** A margin as we show it: whole millimetres, rounded up, so it is never smaller than computed. */
export const shownMarginMm = (mm: number) => Math.ceil(mm - 1e-9);
