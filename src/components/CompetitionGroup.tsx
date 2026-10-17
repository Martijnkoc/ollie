import Link from "next/link";
import type { CompetitionRef, MatchSummary } from "@/lib/football/model";
import { competitionPath } from "@/lib/slug";
import { FavoriteToggle } from "./FavoriteToggle";
import { MatchRow } from "./MatchRow";

export function CompetitionGroup({ competition, matches, headingLevel = 2 }: { competition: CompetitionRef; matches: MatchSummary[]; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className="group" aria-labelledby={`grp-${competition.id}`}>
      <div className="group-head">
        <div className="group-title">
          <span className="group-country">{competition.country}</span>
          <H className="group-name" id={`grp-${competition.id}`}>
            <Link href={competitionPath(competition.slug)}>{competition.name}</Link>
          </H>
        </div>
        <div className="group-actions">
          <Link href={`${competitionPath(competition.slug)}/stand`} className="group-link">
            Stand
          </Link>
          <FavoriteToggle kind="competitions" id={competition.id} name={competition.name} />
        </div>
      </div>
      <ul className="match-list">
        {matches.map((m) => (
          <li key={m.id}>
            <MatchRow match={m} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Groups matches by competition, keeping the order in which competitions first appear. */
export function groupByCompetition(matches: MatchSummary[]) {
  const groups = new Map<number, { competition: CompetitionRef; matches: MatchSummary[] }>();
  for (const m of matches) {
    const g = groups.get(m.competition.id) ?? { competition: m.competition, matches: [] };
    g.matches.push(m);
    groups.set(m.competition.id, g);
  }
  return [...groups.values()];
}
