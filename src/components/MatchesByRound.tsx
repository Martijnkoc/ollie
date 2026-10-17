import type { MatchSummary } from "@/lib/football/model";
import { formatDayShort, localDay } from "@/lib/time";
import { MatchRow } from "./MatchRow";

const STAGES: Record<string, string> = {
  "Regular Season": "Reguliere competitie",
  "League Stage": "Competitiefase",
  "Group Stage": "Groepsfase",
  "Round of 16": "Achtste finales",
  "8th Finals": "Achtste finales",
  "Quarter-finals": "Kwartfinales",
  "Semi-finals": "Halve finales",
  Final: "Finale",
  "Knockout Round Play-offs": "Tussenronde",
  "Play-offs": "Play-offs",
};

export function stageLabel(stage: string | null) {
  if (!stage) return null;
  return STAGES[stage] ?? stage;
}

export function roundLabel(m: Pick<MatchSummary, "roundName" | "stageName">) {
  if (m.roundName && /^\d+$/.test(m.roundName)) {
    const stage = stageLabel(m.stageName);
    return stage && stage !== "Reguliere competitie" ? `${stage} · speelronde ${m.roundName}` : `Speelronde ${m.roundName}`;
  }
  return m.roundName ?? stageLabel(m.stageName) ?? "Overig";
}

/** Matches grouped by round (or stage), each round with an anchor for in-page navigation. */
export function MatchesByRound({ matches, emptyText }: { matches: MatchSummary[]; emptyText: string }) {
  if (matches.length === 0) return <div className="card empty">{emptyText}</div>;
  const groups: { label: string; matches: MatchSummary[] }[] = [];
  for (const m of matches) {
    const label = roundLabel(m);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.matches.push(m);
    else groups.push({ label, matches: [m] });
  }
  return (
    <div className="stack-sm">
      {groups.map((g, i) => (
        <section key={`${g.label}-${i}`} className="group" aria-label={g.label}>
          <h2 className="round-head">{g.label}</h2>
          <ul className="match-list">
            {g.matches.map((m) => (
              <li key={m.id}>
                <MatchRow match={m} showDate={formatDayShort(localDay(new Date(m.kickoffAt)))} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
