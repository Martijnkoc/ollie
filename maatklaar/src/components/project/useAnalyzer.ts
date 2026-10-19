"use client";

import { useCallback, useState } from "react";
import { analyzePage, type AnalysisStage } from "@/lib/documents/render";
import { applyAnalysis } from "@/lib/plan-analysis/apply";
import type { AnalysisResult } from "@/lib/plan-analysis/analyze";
import type { PlanDocument, Project } from "@/lib/projects/schema";
import { loadFile } from "@/lib/projects/store";

export type AnalyzerState = {
  page: number;
  stage: AnalysisStage | null;
  error: string | null;
  done: boolean;
  result: AnalysisResult | null;
};

export const STAGE_LABEL: Record<AnalysisStage["stage"], string> = {
  tekst: "Tekst en posities uit de PDF lezen",
  ocr: "Tekst herkennen op je apparaat (OCR)",
  herkennen: "Kamernamen, maten en schaal zoeken",
};

/** Runs the local analysis of one plan page and merges the result into the project. */
export function useAnalyzer(projectId: string, update: (fn: (p: Project) => Project) => void) {
  const [state, setState] = useState<AnalyzerState | null>(null);

  const run = useCallback(
    async (doc: PlanDocument, page: number, blob?: Blob) => {
      setState({ page, stage: null, error: null, done: false, result: null });
      try {
        const file = blob ?? (await loadFile(projectId));
        if (!file) throw new Error("Het bestand staat niet meer op dit apparaat. Upload het opnieuw om deze pagina te analyseren.");
        const result = await analyzePage(file, doc, page, (stage) => setState((s) => (s ? { ...s, stage } : s)));
        update((p) => applyAnalysis({ ...p, document: p.document ?? doc }, page, result));
        setState({ page, stage: null, error: null, done: true, result });
        return result;
      } catch (err) {
        setState({
          page,
          stage: null,
          error:
            err instanceof Error && err.message.length < 200 ? err.message : "De analyse is mislukt. Je kunt de kamers handmatig invoeren.",
          done: true,
          result: null,
        });
        return null;
      }
    },
    [projectId, update],
  );

  return { state, run };
}
