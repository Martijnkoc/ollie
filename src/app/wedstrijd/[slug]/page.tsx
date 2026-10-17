import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AdSlot } from "@/components/AdSlot";
import { AnalysisCard } from "@/components/AnalysisCard";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { Lineups } from "@/components/Lineups";
import { roundLabel } from "@/components/MatchesByRound";
import { MatchRow } from "@/components/MatchRow";
import { MatchTimeline } from "@/components/MatchTimeline";
import { StandingsTable } from "@/components/StandingsTable";
import { StatsBars } from "@/components/StatsBars";
import { TeamCrest } from "@/components/TeamCrest";
import { analysisFor } from "@/lib/ai/analyses";
import { readContext } from "@/lib/data";
import { config } from "@/lib/env";
import type { MatchSummary } from "@/lib/football/model";
import { getMatchDetail, getMatchVersion } from "@/lib/football/queries";
import { hasScore, isLive, liveClock, statusCategory, statusLabel } from "@/lib/football/status";
import { absoluteUrl, breadcrumbLd, isIndexable } from "@/lib/seo";
import { competitionPath, parseSlugId, teamPath } from "@/lib/slug";
import { formatDate, formatDayLong, formatDayShort, formatTime, formatTimeSeconds, localDay, shortSeasonName } from "@/lib/time";

async function load(props: PageProps<"/wedstrijd/[slug]">) {
  const { slug } = await props.params;
  const parsed = parseSlugId(slug);
  if (!parsed) return null;
  const read = await readContext();
  if (!read) return null;
  const detail = await getMatchDetail(read, parsed.id);
  if (!detail) return null;
  return { read, detail, requested: slug };
}

function scoreText(m: MatchSummary) {
  return hasScore(m.status) && m.score.home !== null && m.score.away !== null ? `${m.score.home}-${m.score.away}` : null;
}

export async function generateMetadata(props: PageProps<"/wedstrijd/[slug]">): Promise<Metadata> {
  const data = await load(props);
  if (!data) return {};
  const m = data.detail.match;
  const day = formatDayLong(localDay(new Date(m.kickoffAt)), true);
  const score = scoreText(m);
  const title = `${m.home.name} - ${m.away.name}${score && statusCategory(m.status) === "finished" ? ` (${score})` : ""}`;
  const state = statusCategory(m.status);
  const description =
    state === "finished"
      ? `Uitslag ${m.home.name} - ${m.away.name} ${score ?? ""} (${m.competition.name}, ${day}): doelpunten, kaarten, opstellingen en statistieken.`
      : state === "off"
        ? `${m.home.name} - ${m.away.name} (${m.competition.name}, ${day}): ${statusLabel(m.status).toLowerCase()}.`
        : `${m.home.name} - ${m.away.name} in de ${m.competition.name} op ${day} om ${formatTime(m.kickoffAt)}: live stand, opstellingen en voorbeschouwing.`;
  return { title, description, alternates: { canonical: m.path }, openGraph: { title, description, type: "article" } };
}

function eventStatus(status: MatchSummary["status"]) {
  if (status === "postponed") return "https://schema.org/EventPostponed";
  if (status === "cancelled") return "https://schema.org/EventCancelled";
  if (statusCategory(status) === "upcoming" || statusCategory(status) === "live" || statusCategory(status) === "finished") return "https://schema.org/EventScheduled";
  return undefined;
}

function RecentList({ title, matches }: { title: string; matches: MatchSummary[] }) {
  return (
    <section className="group" aria-label={title}>
      <h3 className="round-head">{title}</h3>
      {matches.length === 0 ? (
        <p className="empty small">Geen eerdere wedstrijden in de opgeslagen seizoenen.</p>
      ) : (
        <ul className="match-list">
          {matches.map((m) => (
            <li key={m.id}>
              <MatchRow match={m} showDate={formatDayShort(localDay(new Date(m.kickoffAt)))} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function MatchRoute(props: PageProps<"/wedstrijd/[slug]">) {
  const data = await load(props);
  if (!data) notFound();
  const { read, detail, requested } = data;
  const m = detail.match;
  if (`/wedstrijd/${requested}` !== m.path) permanentRedirect(m.path);

  const cfg = config();
  const category = statusCategory(m.status);
  const live = isLive(m.status);
  const score = scoreText(m);
  const kickoff = new Date(m.kickoffAt);
  const minutesToKickoff = (kickoff.getTime() - read.now.getTime()) / 60_000;
  const watch = live || (category === "upcoming" && minutesToKickoff < 120) || (category === "finished" && minutesToKickoff > -240) || m.freshness === "stale";
  const version = watch ? await getMatchVersion(read, m.id) : null;
  const analysis = await analysisFor(read, detail, cfg.ai.apiKey !== null);
  const indexable = isIndexable(cfg);
  const crumbs = [
    { name: "Vandaag", path: "/" },
    { name: m.competition.name, path: competitionPath(m.competition.slug) },
    { name: `${m.home.name} - ${m.away.name}`, path: m.path },
  ];
  const meta = [roundLabel(m), shortSeasonName(detail.seasonName), [detail.venueName, detail.venueCity].filter(Boolean).join(", ") || null, detail.referee ? `Scheidsrechter ${detail.referee}` : null].filter(Boolean);
  const hasHt = m.halftime.home !== null && m.halftime.away !== null && category !== "upcoming";
  const hasEt = detail.extraTime.home !== null && detail.extraTime.away !== null;
  const hasPens = m.penalties.home !== null && m.penalties.away !== null;

  return (
    <div className="container layout layout-two">
      {indexable && <JsonLd data={breadcrumbLd(cfg, crumbs)} />}
      {indexable && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "SportsEvent",
            name: `${m.home.name} - ${m.away.name}`,
            sport: "Soccer",
            startDate: m.kickoffAt,
            url: absoluteUrl(cfg, m.path),
            ...(eventStatus(m.status) ? { eventStatus: eventStatus(m.status) } : {}),
            homeTeam: { "@type": "SportsTeam", name: m.home.name, url: absoluteUrl(cfg, teamPath(m.home)) },
            awayTeam: { "@type": "SportsTeam", name: m.away.name, url: absoluteUrl(cfg, teamPath(m.away)) },
            ...(detail.venueName ? { location: { "@type": "Place", name: detail.venueName, ...(detail.venueCity ? { address: detail.venueCity } : {}) } } : {}),
          }}
        />
      )}
      <div className="stack">
        <div>
          <Breadcrumbs items={crumbs} />
          <section className={`card${live ? " is-live" : ""}`} aria-label="Wedstrijdstand">
            <div className="scoreboard">
              <div className="scoreboard-meta">
                <Link href={competitionPath(m.competition.slug)} className="link">
                  {m.competition.name}
                </Link>{" "}
                · {formatDayLong(localDay(kickoff), true)} · {formatTime(kickoff)}
              </div>
              <div className="scoreboard-main">
                <div className="scoreboard-team">
                  <TeamCrest name={m.home.name} id={m.home.id} logoUrl={m.home.logoUrl} size="md" />
                  <Link href={teamPath(m.home)}>{m.home.name}</Link>
                </div>
                <div>
                  <h1 className="visually-hidden">
                    {m.home.name} tegen {m.away.name}
                  </h1>
                  <div className={`scoreboard-score${score ? "" : " none"}`} aria-label={score ? `Stand ${score}` : "Nog geen stand"}>
                    {score ? score.replace("-", " – ") : category === "upcoming" ? formatTime(kickoff) : "–"}
                  </div>
                </div>
                <div className="scoreboard-team">
                  <TeamCrest name={m.away.name} id={m.away.id} logoUrl={m.away.logoUrl} size="md" />
                  <Link href={teamPath(m.away)}>{m.away.name}</Link>
                </div>
              </div>
              <span className={`status-pill${live ? " live" : category === "off" ? " off" : ""}`}>
                {live && <span className="live-dot" aria-hidden="true" />}
                {statusLabel(m.status)}
                {live && m.minute !== null ? ` · ${liveClock(m.status, m.minute, m.minuteExtra)}` : ""}
              </span>
              {(hasHt || hasEt || hasPens) && (
                <p className="small muted">
                  {[hasHt ? `Rust ${m.halftime.home}-${m.halftime.away}` : null, hasEt ? `Na verlenging ${detail.extraTime.home}-${detail.extraTime.away}` : null, hasPens ? `Strafschoppen ${m.penalties.home}-${m.penalties.away}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {category === "off" && <p className="small muted">Deze wedstrijd is {statusLabel(m.status).toLowerCase()}; er is geen geldige eindstand.</p>}
              {meta.length > 0 && <p className="tiny dim">{meta.join(" · ")}</p>}
              <p className={`freshness${m.freshness === "stale" ? " stale" : ""}`}>
                {m.freshness === "stale" ? "Mogelijk verouderd. " : ""}Laatst bevestigd door de databron om {formatTimeSeconds(m.syncedAt)}
                {formatDate(m.syncedAt) !== formatDate(read.now) ? ` (${formatDate(m.syncedAt)})` : ""}.
              </p>
            </div>
          </section>
          {version && <AutoRefresh matchId={m.id} version={version.version} seconds={live ? Math.max(15, cfg.livePollSeconds) : 60} />}
        </div>

        <section className="card" aria-labelledby="ev-kop">
          <div className="card-head">
            <h2 id="ev-kop">Gebeurtenissen</h2>
          </div>
          {detail.events.length > 0 ? (
            <MatchTimeline events={detail.events} homeName={m.home.name} awayName={m.away.name} />
          ) : (
            <p className="card-body small muted">
              {category === "upcoming"
                ? "De wedstrijd is nog niet begonnen."
                : detail.detailsSyncedAt
                  ? "De databron heeft (nog) geen gebeurtenissen geleverd voor deze wedstrijd."
                  : "Gebeurtenissen zijn voor deze wedstrijd niet opgehaald."}
            </p>
          )}
        </section>

        <section className="card" aria-labelledby="stats-kop">
          <div className="card-head">
            <h2 id="stats-kop">Statistieken</h2>
          </div>
          {detail.statistics ? (
            <StatsBars stats={detail.statistics} />
          ) : (
            <p className="card-body small muted">
              {category === "upcoming" ? "Statistieken volgen zodra de wedstrijd begint." : "Niet beschikbaar: de databron levert voor deze wedstrijd geen statistieken."}
            </p>
          )}
        </section>

        <section className="card" aria-labelledby="lineup-kop">
          <div className="card-head">
            <h2 id="lineup-kop">Opstellingen</h2>
          </div>
          {detail.lineups.home || detail.lineups.away ? (
            <Lineups home={detail.lineups.home} away={detail.lineups.away} homeName={m.home.name} awayName={m.away.name} />
          ) : (
            <p className="card-body small muted">
              {category === "upcoming" ? "Opstellingen worden meestal kort voor de aftrap bekend." : "Niet beschikbaar bij de databron voor deze wedstrijd."}
            </p>
          )}
        </section>

        <AnalysisCard view={analysis} demo={cfg.dataMode === "demo"} />

        <section className="stack-sm" aria-labelledby="vorm-kop">
          <h2 id="vorm-kop">Vorm en onderling</h2>
          <RecentList title={`Laatste wedstrijden ${m.home.name}`} matches={detail.homeRecent} />
          <RecentList title={`Laatste wedstrijden ${m.away.name}`} matches={detail.awayRecent} />
          <RecentList title="Onderlinge duels" matches={detail.headToHead} />
          <p className="tiny dim">Alleen wedstrijden uit de competities en seizoenen die Voetbalradar opslaat.</p>
        </section>
      </div>
      <aside className="aside-context stack">
        {detail.standings.length > 0 && (
          <section className="card" aria-labelledby="stand-kop">
            <div className="card-head">
              <h2 id="stand-kop">
                <Link href={`${competitionPath(m.competition.slug)}/stand`}>Stand {m.competition.name}</Link>
              </h2>
            </div>
            <StandingsTable rows={detail.standings} highlight={[m.home.id, m.away.id]} compact />
          </section>
        )}
        <AdSlot position="match-aside" />
      </aside>
    </div>
  );
}
