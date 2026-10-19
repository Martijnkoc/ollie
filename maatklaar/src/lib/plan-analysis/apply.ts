import { formatMFromMm } from "@/lib/format";
import { newRoom, newWindow } from "@/lib/projects/factory";
import type { Project, ProjectWindow, Room, Scale } from "@/lib/projects/schema";
import type { AnalysisResult } from "./analyze";
import type { AutoMeasureResult } from "./auto-measure";
import { analysisSummary, roomsFromAnalysis, scaleFromNotation, windowsFromAnalysis } from "./to-project";
import { center, type RoomCandidate } from "./types";

function insidePolygon(pt: { x: number; y: number }, poly: { x: number; y: number }[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** A length × width label on the drawing is a second, independent source: compare it with the outline. */
function labelCheck(candidate: RoomCandidate, widthMm: number | null, depthMm: number | null) {
  if (!candidate.dims || widthMm === null || depthMm === null) return null;
  const { lengthMm, widthMm: b } = candidate.dims;
  const close = (x: number, y: number) => Math.abs(x - y) <= Math.max(30, y * 0.02);
  const fits = (close(widthMm, lengthMm) && close(depthMm, b)) || (close(widthMm, b) && close(depthMm, lengthMm));
  return fits
    ? { ok: true, note: `Het label "${candidate.dims.text}" op de tekening klopt met de gemeten omtrek.` }
    : {
        ok: false,
        note: `Het label "${candidate.dims.text}" wijkt af van de gemeten omtrek (${formatMFromMm(widthMm)} × ${formatMFromMm(depthMm)}). Controleer welke maat klopt.`,
      };
}

/**
 * Rooms measured from the walls. Text candidates whose label lies inside a measured outline are merged into
 * it (their notes and label checks travel along); candidates outside every outline stay label-only rooms.
 */
function roomsFromAuto(auto: AutoMeasureResult, result: AnalysisResult, page: number) {
  const used = new Set<RoomCandidate>();
  const byAuto = auto.rooms.map((a): Room | null => {
    const name = a.names.join(" + ");
    const candidates = result.rooms.filter((c) => a.names.includes(c.name) && insidePolygon(center(c.box), a.polygon));
    // Several names in one space usually means inner walls were not recognised (walls drawn as thin lines).
    // Only an open-plan pair without written sizes is kept together; otherwise the names stay separate rooms.
    if (a.names.length >= 3 || (a.names.length === 2 && candidates.some((c) => c.dims || c.areaM2))) return null;
    candidates.forEach((c) => used.add(c));
    const notes = [...a.notes];
    let ok = a.ok;
    let labelled: RoomCandidate | null = null;
    for (const c of candidates) {
      const check = labelCheck(c, a.widthMm, a.depthMm);
      if (check) {
        notes.push(check.note);
        ok &&= check.ok;
        if (check.ok) labelled = c;
      }
      notes.push(...c.notes.filter((n) => !n.startsWith("Bij deze ruimte vonden we geen maten")));
    }
    // An explicit length × width on the drawing that the measured outline confirms, for a rectangular room:
    // keep the written dimensions (the stronger source) and record that both agree.
    const rectangular = a.areaMm2 !== null && a.widthMm && a.depthMm && a.areaMm2 >= a.widthMm * a.depthMm * 0.97;
    if (labelled && rectangular && candidates.length === 1) {
      const [fromLabel] = roomsFromAnalysis({ ...result, rooms: [labelled] }, page);
      return { ...fromLabel!, notes: [...fromLabel!.notes, ...notes.filter((n) => n.includes("klopt"))].slice(0, 10), autoOk: ok };
    }
    const room: Room = newRoom(
      name,
      { kind: "drawn", page, points: a.polygon, status: "auto" },
      {
        nameStatus: "auto",
        origin: "auto",
        page,
        anchor: a.anchor,
        notes: notes.slice(0, 10),
        autoOk: ok,
        doors: a.doors.map((d, i) => ({
          id: `d${i + 1}`,
          wall: d.edge,
          width: { mm: d.widthMm, status: "auto" as const, source: "tekening" as const, sourceText: "deuropening op de tekening" },
        })),
      },
    );
    // A space without a name might be a shaft or a cupboard: listed, but not counted until the user decides.
    if (!name) Object.assign(room, { includeFloor: false, includePlinth: false });
    return room;
  });
  const rest = roomsFromAnalysis({ ...result, rooms: result.rooms.filter((c) => !used.has(c)) }, page);
  return { rooms: [...byAuto.filter((r): r is Room => r !== null), ...rest], byAuto };
}

/**
 * Makelaarsplattegronden often write "Slaapkamer" three times. Repeated names get a number in reading
 * order (top to bottom, left to right), so every room can be told apart in lists and the report.
 */
function numberRepeatedNames(rooms: Room[]) {
  const groups = new Map<string, Room[]>();
  for (const r of rooms) if (r.name && !/\d$/.test(r.name)) groups.set(r.name, [...(groups.get(r.name) ?? []), r]);
  for (const [name, list] of groups) {
    if (list.length < 2) continue;
    list
      .sort((a, b) => (a.anchor?.y ?? 0) - (b.anchor?.y ?? 0) || (a.anchor?.x ?? 0) - (b.anchor?.x ?? 0))
      .forEach((r, i) => (r.name = `${name} ${i + 1}`));
  }
  return rooms;
}

/** `roomIds[i]`: id of the project room that stands for measured room i (null when it has none). */
function windowsFromAuto(auto: AutoMeasureResult, page: number, roomIds: (string | null)[], existing: readonly ProjectWindow[]) {
  const out: ProjectWindow[] = [];
  for (const op of auto.openings) {
    if (op.where !== "gevel" || op.kind !== "raam") continue;
    const roomId = op.rooms.length === 1 ? (roomIds[op.rooms[0]!] ?? null) : null;
    const width = op.widthMm ? ` van ongeveer ${formatMFromMm(op.widthMm)} breed` : "";
    out.push(
      newWindow([...existing, ...out], {
        origin: "auto",
        page,
        position: op.position,
        roomId,
        label: "Raam",
        planWidthMm: op.widthMm ? Math.round(op.widthMm) : null,
        note: `Gevonden als opening in de gevel${width} op de tekening. Dat is een indicatie, geen raammaat: meet het raam zelf. Kan ook een glazen deur zijn.`,
      }),
    );
  }
  return out;
}

/**
 * Merges the analysis of one page into a project. Recognised rooms the user has not confirmed yet are
 * replaced; confirmed and manually added rooms are kept. A scale the user calibrated or confirmed is never
 * overwritten by a candidate from the drawing. A scale from agreeing dimension lines is preferred over a
 * scale notation, which only holds when the PDF has the original paper size.
 */
export function applyAnalysis(project: Project, page: number, result: AnalysisResult, now = new Date()): Project {
  const kind = project.document?.kind ?? "pdf";
  const kept = project.rooms.filter((r) => !(r.origin === "auto" && r.page === page && r.nameStatus === "auto"));
  const keptNames = new Set(kept.filter((r) => r.page === page).map((r) => r.name.toLowerCase()));
  const auto = result.auto && result.auto.rooms.length ? result.auto : null;
  const measured = auto ? roomsFromAuto(auto, result, page) : null;
  const detected = numberRepeatedNames(measured ? measured.rooms : roomsFromAnalysis(result, page));
  const fresh = detected.filter((r) => !r.name || !keptNames.has(r.name.toLowerCase()));

  const existingScale = project.scales.find((s) => s.page === page);
  const fromLines: Scale | null = result.auto?.scale
    ? {
        page,
        mmPerUnit: result.auto.scale.mmPerUnit,
        method: "maatlijnen",
        status: "auto",
        reference: null,
        notation: null,
        evidence: {
          lines: result.auto.scale.lines,
          agreeing: result.auto.scale.agreeing,
          directions: result.auto.scale.directions,
          uncertainty: result.auto.scale.uncertainty,
          outliers: result.auto.scale.outliers.slice(0, 20),
          proven: result.auto.scale.proven,
        },
      }
    : null;
  const candidate = fromLines ?? scaleFromNotation(result, page, kind);
  const scales =
    existingScale && existingScale.status === "confirmed"
      ? project.scales
      : [...project.scales.filter((s) => s.page !== page), ...(candidate ? [candidate] : [])];

  const keptWindows = project.windows.filter(
    (w) => !(w.origin === "auto" && w.page === page && !w.confirmed && Object.keys(w.measures).length === 0),
  );
  // A measured room that lost to a kept room with the same name hands its windows to that room.
  const roomIds = auto
    ? detected
        .slice(0, auto.rooms.length)
        .map((r) =>
          fresh.includes(r) ? r.id : (kept.find((k) => k.page === page && k.name.toLowerCase() === r.name.toLowerCase())?.id ?? null),
        )
    : [];
  const autoWindows = auto ? windowsFromAuto(auto, page, roomIds, keptWindows) : [];
  const windows = [...keptWindows, ...(autoWindows.length ? autoWindows : windowsFromAnalysis(result, page, keptWindows, newWindow))];

  const summary = analysisSummary(result, page, now);
  if (summary.auto && measured) {
    const dropped = measured.byAuto.filter((r) => r === null).length;
    summary.auto.rooms -= dropped;
    if (dropped)
      summary.auto.reasons = [
        "Niet alle binnenwanden zijn herkend (bijvoorbeeld wanden als dunne lijnen). Waar meerdere kamernamen in één ruimte vielen, gebruiken we de maten op de tekening of teken je de ruimte zelf.",
        ...summary.auto.reasons,
      ].slice(0, 10);
  }
  return {
    ...project,
    analyses: [...project.analyses.filter((a) => a.page !== page), summary],
    rooms: [...kept, ...fresh],
    scales,
    windows,
  };
}
