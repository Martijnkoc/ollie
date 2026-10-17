import Link from "next/link";
import type { StandingRow } from "@/lib/football/queries";
import { teamPath } from "@/lib/slug";
import { TeamCrest } from "./TeamCrest";

const na = (v: number | null) =>
  v === null ? (
    <span className="na" title="Niet geleverd door de databron">
      –
    </span>
  ) : (
    v
  );

export function FormBadges({ form }: { form: string | null }) {
  if (!form) return <span className="na">–</span>;
  const words: Record<string, string> = { W: "winst", G: "gelijk", V: "verlies" };
  return (
    <span className="form">
      <span className="visually-hidden">Vorm: {[...form].map((c) => words[c] ?? c).join(", ")}</span>
      {[...form].map((c, i) => (
        <span key={i} className={c} aria-hidden="true">
          {c}
        </span>
      ))}
    </span>
  );
}

/**
 * Standings as supplied by the data source. We do not compute or reorder them ourselves;
 * a value the source did not send is shown as "–", never as 0.
 */
export function StandingsTable({
  rows,
  highlight = [],
  caption,
  compact = false,
}: {
  rows: StandingRow[];
  highlight?: number[];
  caption?: string;
  compact?: boolean;
}) {
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <div className="stack-sm">
      {groups.map((group) => (
        <div className="table-wrap" key={group || "all"}>
          <table className={`standings${compact ? " compact" : ""}`}>
            <caption className={group ? "round-head" : "visually-hidden"} style={{ textAlign: "left", captionSide: "top" }}>
              {group || caption || "Stand"}
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Positie</span>#
                </th>
                <th scope="col" className="team-col">
                  Club
                </th>
                <th scope="col" title="Gespeeld">
                  G
                </th>
                <th scope="col" className="opt" title="Gewonnen">
                  W
                </th>
                <th scope="col" className="opt" title="Gelijk">
                  GL
                </th>
                <th scope="col" className="opt" title="Verloren">
                  V
                </th>
                <th scope="col" className="opt" title="Doelpunten voor en tegen">
                  Doelp.
                </th>
                <th scope="col" title="Doelsaldo">
                  +/-
                </th>
                <th scope="col" title="Punten">
                  P
                </th>
                <th scope="col" className="opt" title="Laatste vijf wedstrijden">
                  Vorm
                </th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => r.group === group)
                .map((r) => (
                  <tr key={r.team.id} className={highlight.includes(r.team.id) ? "highlight" : undefined}>
                    <td className="rank" title={r.description ?? undefined}>
                      {r.rank}
                    </td>
                    <td className="team-col">
                      <Link href={teamPath(r.team)}>
                        <TeamCrest name={r.team.name} id={r.team.id} logoUrl={r.team.logoUrl} />
                        <span className="team-name">{r.team.name}</span>
                      </Link>
                    </td>
                    <td>{na(r.played)}</td>
                    <td className="opt">{na(r.won)}</td>
                    <td className="opt">{na(r.drawn)}</td>
                    <td className="opt">{na(r.lost)}</td>
                    <td className="opt">{r.goalsFor === null || r.goalsAgainst === null ? na(null) : `${r.goalsFor}:${r.goalsAgainst}`}</td>
                    <td>{r.goalDiff === null ? na(null) : r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
                    <td className="pts">{na(r.points)}</td>
                    <td className="opt">
                      <FormBadges form={r.form} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
