import { formatMFromMm, formatPercent, formatCount } from "@/lib/format";
import { ceilSafe } from "@/lib/geometry/units";
import type { Status } from "@/lib/projects/status";

export type PlinthRoomInput = {
  id: string;
  name: string;
  /** Wall lengths (edges of the room outline) in mm, or null when the outline is unknown. */
  edgesMm: number[] | null;
  geometryStatus: Status;
  /** Edge indexes without plinth (built-in cupboard, kitchen units, …). */
  wallsWithoutPlinth: readonly number[];
  /** Door openings; a width only counts when the user confirmed it. */
  doors: readonly { wall: number; widthMm: number | null; confirmed: boolean }[];
  /** Columns or chimney breasts the user wants plinths around: their perimeter in mm. */
  obstaclePerimetersMm: readonly number[];
};

export type PlinthRoomResult = {
  id: string;
  name: string;
  perimeterMm: number | null;
  excludedWallsMm: number;
  doorDeductionMm: number;
  obstacleAdditionMm: number;
  netMm: number | null;
  /** Doors whose width is not confirmed: not deducted, so the room shows "controleren". */
  unconfirmedDoors: number;
  /** Net length per wall that gets a plinth, used for piece planning. */
  wallPiecesMm: number[];
  status: Status;
  issues: string[];
};

export function computeRoomPlinth(room: PlinthRoomInput): PlinthRoomResult {
  const base = {
    id: room.id,
    name: room.name,
    excludedWallsMm: 0,
    doorDeductionMm: 0,
    obstacleAdditionMm: 0,
    unconfirmedDoors: 0,
    wallPiecesMm: [],
  };
  if (!room.edgesMm) {
    return {
      ...base,
      perimeterMm: null,
      netMm: null,
      status: "missing",
      issues: ["De vorm van deze ruimte is onbekend; voer lengte en breedte in of teken de ruimte."],
    };
  }
  const issues: string[] = [];
  const perimeterMm = room.edgesMm.reduce((s, l) => s + l, 0);
  const excluded = new Set(room.wallsWithoutPlinth.filter((i) => i < room.edgesMm!.length));
  const excludedWallsMm = [...excluded].reduce((s, i) => s + room.edgesMm![i]!, 0);

  const perWall = room.edgesMm.map((l, i) => (excluded.has(i) ? 0 : l));
  let doorDeductionMm = 0;
  let unconfirmedDoors = 0;
  for (const door of room.doors) {
    if (door.wall >= room.edgesMm.length) {
      issues.push("Een deuropening hoort bij een wand die niet meer bestaat. Controleer de deuren.");
      continue;
    }
    if (!door.confirmed || door.widthMm === null) {
      unconfirmedDoors++;
      continue;
    }
    if (excluded.has(door.wall)) continue; // no plinth on that wall anyway
    if (door.widthMm > perWall[door.wall]!) {
      issues.push(`Een deur van ${formatMFromMm(door.widthMm)} past niet in een wand van ${formatMFromMm(perWall[door.wall]!)}.`);
      continue;
    }
    perWall[door.wall] = perWall[door.wall]! - door.widthMm;
    doorDeductionMm += door.widthMm;
  }
  if (unconfirmedDoors)
    issues.push(
      `${unconfirmedDoors === 1 ? "Eén deuropening is" : `${unconfirmedDoors} deuropeningen zijn`} nog niet bevestigd en niet afgetrokken.`,
    );

  const obstacleAdditionMm = room.obstaclePerimetersMm.reduce((s, l) => s + l, 0);
  const netMm = perimeterMm - excludedWallsMm - doorDeductionMm + obstacleAdditionMm;
  const wallPiecesMm = [...perWall.filter((l) => l > 0), ...room.obstaclePerimetersMm.filter((l) => l > 0)];

  let status: Status = room.geometryStatus === "derived" ? "derived" : room.geometryStatus === "missing" ? "missing" : "check";
  if (status === "derived" && (unconfirmedDoors > 0 || issues.length)) status = "check";
  return {
    id: room.id,
    name: room.name,
    perimeterMm,
    excludedWallsMm,
    doorDeductionMm,
    obstacleAdditionMm,
    netMm,
    unconfirmedDoors,
    wallPiecesMm,
    status,
    issues,
  };
}

export type PlinthSettings = { marginPercent: number; pieceLengthMm: number | null };

export type PlinthTotals = {
  rooms: PlinthRoomResult[];
  netMm: number;
  incompleteRooms: string[];
  marginPercent: number;
  requiredMm: number | null;
  pieceLengthMm: number | null;
  /** ceil(required ÷ piece length): the minimum when joints may fall anywhere. */
  piecesByTotal: number | null;
  /** Pieces when every wall is covered separately (no joint across a corner), before margin. */
  piecesByWall: number | null;
  status: Status;
  steps: string[];
};

/**
 * Pieces needed when each wall is covered on its own: full pieces per wall plus remainders packed
 * first-fit-decreasing into further pieces. Deterministic, and never fewer than the total-based count.
 */
export function piecesPerWall(wallsMm: readonly number[], pieceLengthMm: number) {
  let pieces = 0;
  const remainders: number[] = [];
  for (const wall of wallsMm) {
    const full = Math.floor(wall / pieceLengthMm + 1e-9);
    pieces += full;
    const rest = wall - full * pieceLengthMm;
    if (rest > 1e-6) remainders.push(rest);
  }
  const bins: number[] = [];
  for (const r of remainders.sort((a, b) => b - a)) {
    const i = bins.findIndex((free) => free >= r - 1e-6);
    if (i >= 0) bins[i] = bins[i]! - r;
    else bins.push(pieceLengthMm - r);
  }
  return pieces + bins.length;
}

export function computePlinths(rooms: readonly PlinthRoomInput[], settings: PlinthSettings): PlinthTotals {
  const results = rooms.map(computeRoomPlinth);
  const incompleteRooms = results.filter((r) => r.netMm === null).map((r) => r.name);
  const known = results.filter((r) => r.netMm !== null);
  const netMm = known.reduce((s, r) => s + r.netMm!, 0);
  const steps: string[] = [];
  for (const r of known) {
    const parts = [`omtrek ${formatMFromMm(r.perimeterMm!)}`];
    if (r.excludedWallsMm) parts.push(`− wanden zonder plint ${formatMFromMm(r.excludedWallsMm)}`);
    if (r.doorDeductionMm) parts.push(`− deuropeningen ${formatMFromMm(r.doorDeductionMm)}`);
    if (r.obstacleAdditionMm) parts.push(`+ rond obstakels ${formatMFromMm(r.obstacleAdditionMm)}`);
    steps.push(`${r.name}: ${parts.join(" ")} = ${formatMFromMm(r.netMm!)}`);
  }

  let requiredMm: number | null = null;
  let piecesByTotal: number | null = null;
  let piecesByWall: number | null = null;
  if (incompleteRooms.length) {
    steps.push(
      `Onvolledig: ${incompleteRooms.join(", ")} ${incompleteRooms.length === 1 ? "heeft" : "hebben"} nog geen bekende vorm. We rekenen nog geen bestelhoeveelheid uit.`,
    );
  } else if (known.length) {
    requiredMm = netMm * (1 + settings.marginPercent / 100);
    steps.push(`Met marge: ${formatMFromMm(netMm)} × (1 + ${formatPercent(settings.marginPercent)}) = ${formatMFromMm(requiredMm)}`);
    if (settings.pieceLengthMm) {
      piecesByTotal = ceilSafe(requiredMm / settings.pieceLengthMm);
      piecesByWall = piecesPerWall(
        known.flatMap((r) => r.wallPiecesMm),
        settings.pieceLengthMm,
      );
      steps.push(
        `Lengtes van ${formatMFromMm(settings.pieceLengthMm)}: ${formatMFromMm(requiredMm)} ÷ ${formatMFromMm(settings.pieceLengthMm)} = ${formatCount(piecesByTotal)} stuks (naar boven afgerond)`,
      );
      steps.push(`Ter controle, per wand zonder las over een hoek en zonder marge: ${formatCount(piecesByWall)} stuks`);
    } else {
      steps.push("Aantal stuks: vul de lengte in waarin jouw plint wordt verkocht. We gebruiken geen standaardlengte.");
    }
  }

  const status: Status =
    incompleteRooms.length || !known.length ? "missing" : known.some((r) => r.status !== "derived") ? "check" : "derived";
  return {
    rooms: results,
    netMm,
    incompleteRooms,
    marginPercent: settings.marginPercent,
    requiredMm,
    pieceLengthMm: settings.pieceLengthMm,
    piecesByTotal,
    piecesByWall,
    status,
    steps,
  };
}
