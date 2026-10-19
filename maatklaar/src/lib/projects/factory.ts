import { DEFAULT_PLINTH_MARGIN_PERCENT, PATTERNS } from "@/lib/materials/patterns";
import { defaultRuleFor } from "@/lib/measurements/protocols";
import type { Mounting, ProductFamily } from "@/lib/measurements/schema";
import { MISSING, SCHEMA_VERSION, type Length, type Project, type ProjectWindow, type Room, type RoomShape } from "./schema";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Random, unguessable id from the platform CSPRNG (browser and Node). */
export function randomId(length = 20) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function newProject(now = new Date()): Project {
  const recht = PATTERNS[0];
  return {
    schemaVersion: SCHEMA_VERSION,
    id: randomId(20),
    name: "Mijn woning",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    address: null,
    building: null,
    document: null,
    analyses: [],
    scales: [],
    rooms: [],
    windows: [],
    floor: { pattern: recht.key, wastePercent: recht.guidePercent, packM2: null, productNote: "" },
    plinth: { marginPercent: DEFAULT_PLINTH_MARGIN_PERCENT, pieceLengthMm: null },
    payment: null,
    report: { includeAddress: false },
  };
}

/** Spaces that usually have no indoor floor. Shown unticked by default, with the reason; the user decides. */
const NOT_FLOOR_BY_DEFAULT = /\b(vide|trapgat|tuin|balkon|terras|dakterras|loggia|schuur|carport)\b/i;
/** Wet rooms usually get tiles and no wooden plinth; also only a default. */
const NO_PLINTH_BY_DEFAULT = /\b(badkamer|douche|toilet|wc|vide|trapgat|tuin|balkon|terras|dakterras|loggia|meterkast)\b/i;

export function defaultInclusion(name: string) {
  return { includeFloor: !NOT_FLOOR_BY_DEFAULT.test(name), includePlinth: !NO_PLINTH_BY_DEFAULT.test(name) };
}

export function newRoom(name: string, shape: RoomShape, extra: Partial<Room> = {}): Room {
  return {
    id: randomId(12),
    name,
    nameStatus: "confirmed",
    origin: "manual",
    page: null,
    anchor: null,
    shape,
    obstacles: [],
    ...defaultInclusion(name),
    wallsWithoutPlinth: [],
    doors: [],
    notes: [],
    ...extra,
  };
}

export const emptyRect = (): RoomShape => ({ kind: "rect", length: { ...MISSING }, width: { ...MISSING } });

export function userLength(mm: number | null): Length {
  return mm === null || !(mm > 0) ? { ...MISSING } : { mm, status: "confirmed", source: "gebruiker" };
}

/** Next free window code: R01, R02 … (codes of deleted windows are not reused within a project). */
export function nextWindowCode(windows: readonly ProjectWindow[]) {
  const max = windows.reduce((m, w) => Math.max(m, Number(w.code.slice(1))), 0);
  return `R${String(max + 1).padStart(2, "0")}`;
}

export function newWindow(windows: readonly ProjectWindow[], extra: Partial<ProjectWindow> = {}): ProjectWindow {
  const product: ProductFamily = extra.product ?? "onbekend";
  const mounting: Mounting = extra.mounting ?? "onbekend";
  return {
    id: randomId(12),
    code: nextWindowCode(windows),
    label: "",
    roomId: null,
    page: null,
    position: null,
    origin: "manual",
    note: "",
    windowType: "",
    product,
    mounting,
    ruleId: defaultRuleFor(product, mounting).id,
    measures: {},
    measureSource: "gebruiker",
    checks: {},
    deviationAcknowledged: false,
    confirmed: false,
    fullness: null,
    ...extra,
  };
}
