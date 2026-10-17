import Link from "next/link";
import type { MatchSummary } from "@/lib/football/model";
import { hasScore, isLive, rowClock, statusCategory, statusLabel } from "@/lib/football/status";
import { formatTime } from "@/lib/time";
import { TeamCrest } from "./TeamCrest";

/** One match in a list. Works in server and client components (no hooks of its own). */
export function MatchRow({ match, showDate = false }: { match: MatchSummary; showDate?: string | false }) {
  const category = statusCategory(match.status);
  const live = isLive(match.status);
  const scored = hasScore(match.status) && match.score.home !== null && match.score.away !== null;
  const kickoff = formatTime(match.kickoffAt);
  const clock = rowClock(match.status, match.minute, match.minuteExtra, kickoff);
  const winner = scored && category === "finished" ? Math.sign((match.score.home ?? 0) - (match.score.away ?? 0)) : 0;
  const pens = match.penalties.home !== null && match.penalties.away !== null;
  const scoreText = scored ? `${match.score.home}-${match.score.away}` : "nog geen score";
  const label = `${match.home.name} tegen ${match.away.name}, ${statusLabel(match.status)}${live && match.minute ? ` (${clock})` : ""}, ${scoreText}${
    category === "upcoming" ? `, aftrap ${kickoff}` : ""
  }`;

  return (
    <div className={`match-row${live ? " is-live" : ""}${category === "off" ? " is-off" : ""}`}>
      <Link href={match.path} className="row-link" aria-label={label} prefetch={false} />
      <div className="match-time">
        <span>
          {live && <span className="live-dot" aria-hidden="true" />}
          {clock}
        </span>
        {showDate && <span className="state">{showDate}</span>}
        {!showDate && category === "finished" && clock !== kickoff && <span className="state">{kickoff}</span>}
        {match.freshness === "stale" && (
          <span className="stale-flag" title="Deze gegevens zijn mogelijk niet actueel">
            verouderd?
          </span>
        )}
      </div>
      <div className={`team home${winner > 0 ? " winner" : winner < 0 ? " loser" : ""}`}>
        <span className="team-name">{match.home.name}</span>
        <TeamCrest name={match.home.name} id={match.home.id} logoUrl={match.home.logoUrl} />
      </div>
      <div className="score" aria-hidden="true">
        {scored ? (
          <>
            <span>{match.score.home}</span>
            <span className="sep">-</span>
            <span>{match.score.away}</span>
          </>
        ) : (
          <span className="score-none">–</span>
        )}
      </div>
      <div className={`team away${winner < 0 ? " winner" : winner > 0 ? " loser" : ""}`}>
        <TeamCrest name={match.away.name} id={match.away.id} logoUrl={match.away.logoUrl} />
        <span className="team-name">{match.away.name}</span>
      </div>
      {pens && (
        <div className="score-sub">
          strafschoppen {match.penalties.home}-{match.penalties.away}
        </div>
      )}
    </div>
  );
}
