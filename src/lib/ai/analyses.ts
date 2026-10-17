import "server-only";
import type { MatchDetail, ReadContext } from "@/lib/football/queries";
import { isFinished, isUpcoming } from "@/lib/football/status";
import { stableHash } from "@/lib/football/repository";
import { PROVIDER_LABEL } from "@/lib/providers/labels";
import { buildAnalysisInput, type AnalysisInput } from "./input";
import { analysisSchema, type Analysis, type AnalysisKind } from "./schema";

export function analysisKindFor(detail: MatchDetail): AnalysisKind | null {
  if (isUpcoming(detail.match.status)) return "preview";
  if (isFinished(detail.match.status)) return "review";
  return null;
}

/** The hash ignores nothing but formatting: any change in the facts makes a stored analysis outdated. */
export function inputHash(input: AnalysisInput) {
  return stableHash(input);
}

export type AnalysisView =
  | { state: "disabled" }
  | { state: "none"; kind: AnalysisKind | null }
  | { state: "outdated"; kind: AnalysisKind; createdAt: string }
  | { state: "current"; kind: AnalysisKind; analysis: Analysis; createdAt: string; dataAsOf: string; model: string };

/** The stored analysis for a match page, only shown when it was made from exactly the current data. */
export async function analysisFor(ctx: ReadContext, detail: MatchDetail, enabled: boolean): Promise<AnalysisView> {
  const kind = analysisKindFor(detail);
  if (!kind) return { state: "none", kind: null };
  const hash = inputHash(buildAnalysisInput(detail, kind, PROVIDER_LABEL[ctx.provider] ?? ctx.provider));
  const [row] = await ctx.db.query<{ input_hash: string; content: unknown; created_at: Date; data_as_of: Date; model: string }>(
    `select input_hash, content, created_at, data_as_of, model from ai_analyses
     where match_id = $1 and kind = $2 and status = 'ok' order by created_at desc limit 1`,
    [detail.match.id, kind],
  );
  if (!row) return enabled ? { state: "none", kind } : { state: "disabled" };
  const createdAt = new Date(row.created_at).toISOString();
  if (row.input_hash !== hash) return { state: "outdated", kind, createdAt };
  const parsed = analysisSchema.safeParse(row.content);
  if (!parsed.success) return { state: "none", kind };
  return { state: "current", kind, analysis: parsed.data, createdAt, dataAsOf: new Date(row.data_as_of).toISOString(), model: row.model };
}
