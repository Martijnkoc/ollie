import { formatM2, formatPercent, formatCount } from "@/lib/format";
import { ceilSafe, mm2ToM2 } from "@/lib/geometry/units";
import type { Status } from "@/lib/projects/status";

export type FloorRow = {
  id: string;
  name: string;
  included: boolean;
  /** Net floor area in mm² (room minus obstacles), or null when unknown. */
  areaMm2: number | null;
  status: Status;
};

export type FloorSettings = {
  wastePercent: number;
  /** m² per pack, only when confirmed by the user or a reliable product source. */
  packM2: number | null;
};

export type FloorResult = {
  rows: (FloorRow & { areaM2: number | null })[];
  includedCount: number;
  /** Sum of included rooms with a known area. */
  selectedNetM2: number;
  /** Included rooms that have no area yet. While > 0 the total is incomplete and nothing is ordered from it. */
  incompleteRooms: string[];
  wastePercent: number;
  /** benodigd_m2 = geselecteerde_netto_m2 × (1 + snijverlies / 100); null while incomplete. */
  requiredM2: number | null;
  packM2: number | null;
  /** aantal_pakken = ceil(benodigd_m2 / pack_m2); only with a confirmed pack size. */
  packs: number | null;
  status: Status;
  steps: string[];
};

export function computeFloor(rows: readonly FloorRow[], settings: FloorSettings): FloorResult {
  const withM2 = rows.map((r) => ({ ...r, areaM2: r.areaMm2 === null ? null : mm2ToM2(r.areaMm2) }));
  const included = withM2.filter((r) => r.included);
  const incompleteRooms = included.filter((r) => r.areaM2 === null).map((r) => r.name);
  const known = included.filter((r) => r.areaM2 !== null);
  const selectedNetM2 = known.reduce((s, r) => s + r.areaM2!, 0);

  const steps: string[] = [];
  if (known.length) {
    steps.push(`Geselecteerd netto: ${known.map((r) => `${r.name} ${formatM2(r.areaM2!)}`).join(" + ")} = ${formatM2(selectedNetM2)}`);
  }
  const excluded = withM2.filter((r) => !r.included);
  if (excluded.length) steps.push(`Niet meegeteld: ${excluded.map((r) => r.name).join(", ")}`);

  let requiredM2: number | null = null;
  let packs: number | null = null;
  if (incompleteRooms.length) {
    steps.push(`Onvolledig: ${incompleteRooms.join(", ")} ${incompleteRooms.length === 1 ? "heeft" : "hebben"} nog geen oppervlakte. Daarom rekenen we nog geen bestelhoeveelheid uit.`);
  } else if (included.length) {
    requiredM2 = selectedNetM2 * (1 + settings.wastePercent / 100);
    steps.push(`Met snijverlies: ${formatM2(selectedNetM2)} × (1 + ${formatPercent(settings.wastePercent)}) = ${formatM2(requiredM2)}`);
    if (settings.packM2 !== null && settings.packM2 > 0) {
      packs = ceilSafe(requiredM2 / settings.packM2);
      steps.push(`Pakken: ${formatM2(requiredM2)} ÷ ${formatM2(settings.packM2, 3)} per pak = ${formatCount(packs)} (naar boven afgerond)`);
    } else {
      steps.push("Aantal pakken: vul de oppervlakte per pak van jouw vloer in. We gebruiken geen standaardpakgrootte.");
    }
  }

  const statuses = included.map((r) => r.status);
  const status: Status = incompleteRooms.length || !included.length ? "missing" : statuses.some((s) => s !== "derived" && s !== "confirmed") ? "check" : "derived";

  return {
    rows: withM2,
    includedCount: included.length,
    selectedNetM2,
    incompleteRooms,
    wastePercent: settings.wastePercent,
    requiredM2,
    packM2: settings.packM2,
    packs,
    status,
    steps,
  };
}
