import { newWindow } from "@/lib/projects/factory";
import type { Project } from "@/lib/projects/schema";
import type { AnalysisResult } from "./analyze";
import { analysisSummary, roomsFromAnalysis, scaleFromNotation, windowsFromAnalysis } from "./to-project";

/**
 * Merges the analysis of one page into a project. Recognised rooms the user has not confirmed yet are
 * replaced; confirmed and manually added rooms are kept. A scale the user calibrated or confirmed is never
 * overwritten by a candidate from the drawing.
 */
export function applyAnalysis(project: Project, page: number, result: AnalysisResult, now = new Date()): Project {
  const kind = project.document?.kind ?? "pdf";
  const kept = project.rooms.filter((r) => !(r.origin === "auto" && r.page === page && r.nameStatus === "auto"));
  const keptNames = new Set(kept.filter((r) => r.page === page).map((r) => r.name.toLowerCase()));
  const fresh = roomsFromAnalysis(result, page).filter((r) => !keptNames.has(r.name.toLowerCase()));

  const existingScale = project.scales.find((s) => s.page === page);
  const candidate = scaleFromNotation(result, page, kind);
  const scales =
    existingScale && existingScale.status === "confirmed"
      ? project.scales
      : [...project.scales.filter((s) => s.page !== page), ...(candidate ? [candidate] : [])];

  const keptWindows = project.windows.filter(
    (w) => !(w.origin === "auto" && w.page === page && !w.confirmed && Object.keys(w.measures).length === 0),
  );
  const windows = [...keptWindows, ...windowsFromAnalysis(result, page, keptWindows, newWindow)];

  return {
    ...project,
    analyses: [...project.analyses.filter((a) => a.page !== page), analysisSummary(result, page, now)],
    rooms: [...kept, ...fresh],
    scales,
    windows,
  };
}
