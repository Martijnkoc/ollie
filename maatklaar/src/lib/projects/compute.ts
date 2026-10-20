import { shapeGeometry, type ShapeGeometry } from "@/lib/geometry/shapes";
import { polygonsOverlap } from "@/lib/geometry/polygon";
import { computeFloor, type FloorResult } from "@/lib/materials/floor";
import { computePlinths, type PlinthTotals } from "@/lib/materials/plinths";
import { evaluateWindow, type WindowEvaluation } from "@/lib/measurements/evaluate";
import { defaultRuleFor, findRule } from "@/lib/measurements/protocols";
import type { MeasureKey, MeasurementRuleSet } from "@/lib/measurements/schema";
import { productRule } from "@/lib/rules";
import { orderDimensions, type MeasureStatus, type OrderInput, type OrderResult } from "@/lib/rules/engine";
import type { Project, ProjectWindow, Room } from "./schema";
import { combine, type Status } from "./status";

export type RoomResult = {
  room: Room;
  geometry: ShapeGeometry;
  obstaclesMm2: number;
  /** Floor area minus obstacles, in mm². */
  netAreaMm2: number | null;
  status: Status;
  issues: string[];
};

export type ScaleSource = "webxr_hit_test" | "webxr_hit_test_depth" | "handmatig";

/**
 * The measured opening of a window (observed layer), in millimetres, unrounded. Width and height are the
 * smallest of their measuring points: the clear opening. Kept apart from the order size, which only a
 * product rule decides.
 */
export type ObservedOpeningDimensions = {
  openingWidthMm: number | null;
  openingHeightMm: number | null;
  depthMm: number | null;
  /** Margin at about 95 % per dimension; null for a value measured by the user (no margin known). */
  measurementUncertaintyMm: { width: number | null; height: number | null; depth: number | null };
  scaleSource: { width: ScaleSource | null; height: ScaleSource | null; depth: ScaleSource | null };
  status: { width: MeasureStatus | null; height: MeasureStatus | null; depth: MeasureStatus | null };
};

/**
 * One window in three layers: its scan geometry and opening measurements (`window`, `opening`), the evaluation
 * of those measurements (`evaluation`) and the order size from its product rule (`order`).
 */
export type WindowResult = {
  window: ProjectWindow;
  rule: MeasurementRuleSet;
  evaluation: WindowEvaluation;
  opening: ObservedOpeningDimensions;
  order: OrderResult;
  roomName: string | null;
};

export type ProjectComputation = {
  rooms: RoomResult[];
  floor: FloorResult;
  plinths: PlinthTotals;
  windows: WindowResult[];
  /** Pairs of drawn rooms that overlap on the plan (would be counted twice). */
  overlaps: [string, string][];
  /** Room names used more than once. */
  duplicateNames: string[];
  /**
   * True only when every included room rests on confirmed input (and a confirmed scale for drawn rooms),
   * nothing overlaps and the floor total is complete. Drives the "gecontroleerd" label; never set otherwise.
   */
  verified: boolean;
};

export const roomName = (room: Pick<Room, "name">) => room.name.trim() || "Naamloze ruimte";

export function computeRoom(room: Room, project: Pick<Project, "scales">): RoomResult {
  const geometry = shapeGeometry(room.shape, project.scales);
  const issues = [...geometry.issues];
  let obstaclesMm2 = 0;
  const obstacleStatuses: Status[] = [];
  for (const o of room.obstacles) {
    if (o.length.mm === null || o.width.mm === null) {
      issues.push(`Obstakel "${o.name}" heeft nog geen afmetingen en is niet afgetrokken.`);
      obstacleStatuses.push("missing");
      continue;
    }
    obstaclesMm2 += o.length.mm * o.width.mm;
    obstacleStatuses.push(o.length.status, o.width.status);
  }
  let netAreaMm2 = geometry.areaMm2 === null ? null : geometry.areaMm2 - obstaclesMm2;
  if (netAreaMm2 !== null && netAreaMm2 <= 0) {
    issues.push("Obstakels zijn groter dan de ruimte zelf. Controleer de maten.");
    netAreaMm2 = null;
  }
  const status =
    netAreaMm2 === null ? "missing" : combine([geometry.status, ...obstacleStatuses, room.nameStatus === "auto" ? "auto" : "confirmed"]);
  return { room, geometry, obstaclesMm2, netAreaMm2, status, issues };
}

export function windowRule(w: ProjectWindow) {
  const chosen = findRule(w.ruleId);
  // A rule that no longer exists (removed supplier rule) falls back to the generic protocol, never to a guess.
  if (chosen && chosen.productFamilies.includes(w.product) && chosen.mounting === w.mounting) return chosen;
  return defaultRuleFor(w.product, w.mounting);
}

/** Status of one measurement: a ScanTag value keeps its verdict, a typed value counts once confirmed. */
export function measureStatus(w: ProjectWindow, k: MeasureKey): MeasureStatus {
  const s = w.sources[k];
  return s ? s.status : w.confirmed ? "user_confirmed" : "unconfirmed";
}

/** What the rule engine needs from a window: measurements with their status, answers, checks, shape. */
export function orderInputFor(w: ProjectWindow): OrderInput {
  const status: OrderInput["status"] = {};
  for (const k of Object.keys(w.measures) as MeasureKey[]) status[k] = measureStatus(w, k);
  return { measures: w.measures, answers: w.answers, checks: w.checks, status, confirmed: w.confirmed, shape: w.shape };
}

export function observedOpening(w: ProjectWindow): ObservedOpeningDimensions {
  const smallest = (keys: readonly MeasureKey[]) => {
    const present = keys.filter((k) => typeof w.measures[k] === "number");
    if (!present.length) return null;
    return present.reduce((a, b) => (w.measures[b]! < w.measures[a]! ? b : a));
  };
  const width = smallest(["breedte_boven", "breedte_midden", "breedte_onder"]);
  const height = smallest(["hoogte_links", "hoogte_midden", "hoogte_rechts"]);
  const depth = typeof w.measures.diepte === "number" ? ("diepte" as const) : null;
  const mm = (k: MeasureKey | null) => (k ? w.measures[k]! : null);
  const margin = (k: MeasureKey | null) => (k && w.sources[k] ? w.sources[k]!.uncertaintyMm : null);
  const scale = (k: MeasureKey | null): ScaleSource | null => (k ? (w.sources[k]?.scaleSource ?? "handmatig") : null);
  const status = (k: MeasureKey | null) => (k ? measureStatus(w, k) : null);
  return {
    openingWidthMm: mm(width),
    openingHeightMm: mm(height),
    depthMm: mm(depth),
    measurementUncertaintyMm: { width: margin(width), height: margin(height), depth: margin(depth) },
    scaleSource: { width: scale(width), height: scale(height), depth: scale(depth) },
    status: { width: status(width), height: status(height), depth: status(depth) },
  };
}

/** The order layer of a window: its rule applied to its measurements. */
export function windowOrder(w: ProjectWindow, rule: MeasurementRuleSet): OrderResult {
  return orderDimensions(productRule(rule.id)!, orderInputFor(w));
}

export function computeProject(project: Project): ProjectComputation {
  const rooms = project.rooms.map((r) => computeRoom(r, project));

  const overlaps: [string, string][] = [];
  const drawn = rooms.filter((r) => r.room.shape.kind === "drawn" && r.geometry.polygonMm);
  for (let i = 0; i < drawn.length; i++) {
    for (let j = i + 1; j < drawn.length; j++) {
      const a = drawn[i]!;
      const b = drawn[j]!;
      if (a.room.shape.kind !== "drawn" || b.room.shape.kind !== "drawn" || a.room.shape.page !== b.room.shape.page) continue;
      if (polygonsOverlap(a.room.shape.points, b.room.shape.points)) overlaps.push([a.room.id, b.room.id]);
    }
  }
  const overlapping = new Set(overlaps.flat());
  for (const r of rooms) {
    if (overlapping.has(r.room.id)) {
      r.issues.push("Deze ruimte overlapt met een andere ruimte en zou dubbel kunnen tellen.");
      if (r.status === "derived") r.status = "check";
    }
  }

  const counts = new Map<string, number>();
  for (const r of project.rooms)
    if (r.name.trim()) counts.set(r.name.trim().toLowerCase(), (counts.get(r.name.trim().toLowerCase()) ?? 0) + 1);
  const duplicateNames = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([name]) => project.rooms.find((r) => r.name.trim().toLowerCase() === name)!.name);

  const floor = computeFloor(
    rooms.map((r) => ({ id: r.room.id, name: roomName(r.room), included: r.room.includeFloor, areaMm2: r.netAreaMm2, status: r.status })),
    { wastePercent: project.floor.wastePercent, packM2: project.floor.packM2 },
  );

  const plinths = computePlinths(
    rooms
      .filter((r) => r.room.includePlinth)
      .map((r) => ({
        id: r.room.id,
        name: roomName(r.room),
        edgesMm: r.geometry.edgesMm,
        geometryStatus: r.geometry.edgesMm ? combine([r.geometry.status, r.room.nameStatus === "auto" ? "auto" : "confirmed"]) : "missing",
        wallsWithoutPlinth: r.room.wallsWithoutPlinth,
        doors: r.room.doors.map((d) => ({ wall: d.wall, widthMm: d.width.mm, confirmed: d.width.status === "confirmed" })),
        obstaclePerimetersMm: r.room.obstacles
          .filter((o) => o.plinthAround && o.length.mm !== null && o.width.mm !== null)
          .map((o) => 2 * (o.length.mm! + o.width.mm!)),
      })),
    project.plinth,
  );

  const roomNames = new Map(project.rooms.map((r) => [r.id, roomName(r)]));
  const windows = project.windows.map((w) => {
    const rule = windowRule(w);
    return {
      window: w,
      rule,
      evaluation: evaluateWindow(w, rule),
      opening: observedOpening(w),
      order: windowOrder(w, rule),
      roomName: w.roomId ? (roomNames.get(w.roomId) ?? null) : null,
    };
  });

  const included = rooms.filter((r) => r.room.includeFloor);
  const verified =
    included.length > 0 && overlaps.length === 0 && floor.incompleteRooms.length === 0 && included.every((r) => r.status === "derived");

  return { rooms, floor, plinths, windows, overlaps, duplicateNames, verified };
}
