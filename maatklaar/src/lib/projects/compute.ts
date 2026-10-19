import { shapeGeometry, type ShapeGeometry } from "@/lib/geometry/shapes";
import { polygonsOverlap } from "@/lib/geometry/polygon";
import { computeFloor, type FloorResult } from "@/lib/materials/floor";
import { computePlinths, type PlinthTotals } from "@/lib/materials/plinths";
import { evaluateWindow, type WindowEvaluation } from "@/lib/measurements/evaluate";
import { defaultRuleFor, findRule } from "@/lib/measurements/protocols";
import type { MeasurementRuleSet } from "@/lib/measurements/schema";
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

export type WindowResult = { window: ProjectWindow; rule: MeasurementRuleSet; evaluation: WindowEvaluation; roomName: string | null };

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
  const status = netAreaMm2 === null ? "missing" : combine([geometry.status, ...obstacleStatuses, room.nameStatus === "auto" ? "auto" : "confirmed"]);
  return { room, geometry, obstaclesMm2, netAreaMm2, status, issues };
}

export function windowRule(w: ProjectWindow, rules?: readonly MeasurementRuleSet[]) {
  const chosen = findRule(w.ruleId, rules);
  // A rule that no longer exists (removed supplier rule) falls back to the generic protocol, never to a guess.
  if (chosen && chosen.productFamilies.includes(w.product) && chosen.mounting === w.mounting) return chosen;
  return defaultRuleFor(w.product, w.mounting);
}

export function computeProject(project: Project, rules?: readonly MeasurementRuleSet[]): ProjectComputation {
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
  for (const r of project.rooms) counts.set(r.name.trim().toLowerCase(), (counts.get(r.name.trim().toLowerCase()) ?? 0) + 1);
  const duplicateNames = [...counts.entries()].filter(([, n]) => n > 1).map(([name]) => project.rooms.find((r) => r.name.trim().toLowerCase() === name)!.name);

  const floor = computeFloor(
    rooms.map((r) => ({ id: r.room.id, name: r.room.name, included: r.room.includeFloor, areaMm2: r.netAreaMm2, status: r.status })),
    { wastePercent: project.floor.wastePercent, packM2: project.floor.packM2 },
  );

  const plinths = computePlinths(
    rooms
      .filter((r) => r.room.includePlinth)
      .map((r) => ({
        id: r.room.id,
        name: r.room.name,
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

  const roomNames = new Map(project.rooms.map((r) => [r.id, r.name]));
  const windows = project.windows.map((w) => {
    const rule = windowRule(w, rules);
    return {
      window: w,
      rule,
      evaluation: evaluateWindow(w, rule),
      roomName: w.roomId ? (roomNames.get(w.roomId) ?? null) : null,
    };
  });

  const included = rooms.filter((r) => r.room.includeFloor);
  const verified = included.length > 0 && overlaps.length === 0 && floor.incompleteRooms.length === 0 && included.every((r) => r.status === "derived");

  return { rooms, floor, plinths, windows, overlaps, duplicateNames, verified };
}
