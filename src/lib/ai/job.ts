import "server-only";
import { getMatchDetail } from "@/lib/football/queries";
import { localDayRange, localDay } from "@/lib/time";
import type { JobContext, JobResult } from "@/lib/sync/jobs";
import { PROVIDER_LABEL } from "@/lib/providers/labels";
import { analysisKindFor, inputHash } from "./analyses";
import { buildAnalysisInput } from "./input";
import { AnalysisRefused, createAnalysisService, type AnalysisService } from "./service";
import { validateAnalysis } from "./validate";

const PER_RUN = 5;
/** Never regenerate the same match and kind more often than this, whatever changed. */
const MIN_INTERVAL_HOURS = 6;

/**
 * Generates analyses ahead of time, never per page view: previews for matches in the next 36 hours,
 * reviews for matches that finished in the last two days with final details. Rejected outputs are
 * stored for auditing and never shown.
 */
export async function syncAnalyses(ctx: JobContext, service: AnalysisService | null = createAnalysisService(ctx.cfg)): Promise<JobResult> {
  if (!service) return { items: 0, message: "AI niet geconfigureerd (ANTHROPIC_API_KEY ontbreekt)", nextDueInSeconds: 6 * 3600 };
  const now = ctx.now();
  const { start } = localDayRange(localDay(now));
  const [{ n: today }] = await ctx.db.query<{ n: number }>(`select count(*)::int as n from ai_analyses where created_at >= $1`, [start]);
  if (today >= ctx.cfg.ai.dailyLimit) return { items: 0, message: `Daglimiet AI bereikt (${today}/${ctx.cfg.ai.dailyLimit})`, nextDueInSeconds: 3600 };

  const candidates = await ctx.db.query<{ id: number }>(
    `select m.id from matches m
     join competitions c on c.id = m.competition_id and c.availability = 'available'
     join teams h on h.id = m.home_team_id join teams a on a.id = m.away_team_id
     where m.provider = $1 and not h.is_placeholder and not a.is_placeholder and (
       (m.status = 'scheduled' and m.kickoff_at between $2 and $3)
       or (m.status in ('finished', 'finished_aet', 'finished_pen') and m.kickoff_at > $4 and m.details_synced_at > m.kickoff_at + interval '150 minutes')
     )
     and not exists (select 1 from ai_analyses x where x.match_id = m.id and x.created_at > $5 and x.kind = case when m.status = 'scheduled' then 'preview' else 'review' end)
     order by m.kickoff_at limit 40`,
    [ctx.provider.id, now, new Date(now.getTime() + 36 * 3600_000), new Date(now.getTime() - 48 * 3600_000), new Date(now.getTime() - MIN_INTERVAL_HOURS * 3600_000)],
  );

  const read = { db: ctx.db, cfg: ctx.cfg, provider: ctx.provider.id, now };
  let made = 0;
  let rejected = 0;
  let failed = 0;
  for (const c of candidates) {
    if (made + rejected + failed >= PER_RUN || today + made + rejected + failed >= ctx.cfg.ai.dailyLimit) break;
    const detail = await getMatchDetail(read, c.id);
    if (!detail) continue;
    const kind = analysisKindFor(detail);
    if (!kind) continue;
    const input = buildAnalysisInput(detail, kind, PROVIDER_LABEL[ctx.provider.id] ?? ctx.provider.id);
    const hash = inputHash(input);
    const [exists] = await ctx.db.query(`select 1 from ai_analyses where match_id = $1 and kind = $2 and input_hash = $3`, [c.id, kind, hash]);
    if (exists) continue;
    const dataAsOf = [detail.match.syncedAt, detail.detailsSyncedAt].filter((d): d is string => d !== null).sort().pop()!;
    const expires = kind === "preview" ? new Date(detail.match.kickoffAt) : null;
    try {
      const generated = await service.generate(input);
      const verdict = validateAnalysis(generated.raw, input, kind);
      await ctx.db.query(
        `insert into ai_analyses (match_id, kind, input_hash, status, ai_provider, model, content, note, data_as_of, input_tokens, output_tokens, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) on conflict (match_id, kind, input_hash) do nothing`,
        [
          c.id,
          kind,
          hash,
          verdict.ok ? "ok" : "rejected",
          service.provider,
          generated.model,
          verdict.ok ? JSON.stringify(verdict.analysis) : JSON.stringify(generated.raw),
          verdict.ok ? null : verdict.reason,
          dataAsOf,
          generated.inputTokens,
          generated.outputTokens,
          expires,
        ],
      );
      if (verdict.ok) made++;
      else rejected++;
    } catch (err) {
      failed++;
      const note = err instanceof AnalysisRefused ? err.message : err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : "Onbekende fout";
      await ctx.db.query(
        `insert into ai_analyses (match_id, kind, input_hash, status, ai_provider, model, note, data_as_of, expires_at)
         values ($1, $2, $3, 'failed', $4, $5, $6, $7, $8) on conflict (match_id, kind, input_hash) do nothing`,
        [c.id, kind, hash, service.provider, service.model, note, dataAsOf, expires],
      );
    }
  }
  return {
    items: made,
    message: `${made} analyses gemaakt, ${rejected} afgekeurd door validatie, ${failed} mislukt`,
    nextDueInSeconds: candidates.length > PER_RUN ? 10 * 60 : 30 * 60,
  };
}
