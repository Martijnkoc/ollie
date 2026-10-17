import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { JsonLd } from "@/components/JsonLd";
import { MatchRow } from "@/components/MatchRow";
import { StandingsTable } from "@/components/StandingsTable";
import { TeamCrest } from "@/components/TeamCrest";
import { readContext } from "@/lib/data";
import { config } from "@/lib/env";
import type { MatchSummary } from "@/lib/football/model";
import { getTeamPage } from "@/lib/football/queries";
import { breadcrumbLd, isIndexable } from "@/lib/seo";
import { competitionPath, parseSlugId, teamPath } from "@/lib/slug";
import { formatDayShort, localDay } from "@/lib/time";

async function load(props: PageProps<"/team/[slug]">) {
  const { slug } = await props.params;
  const parsed = parseSlugId(slug);
  if (!parsed) return null;
  const read = await readContext();
  if (!read) return null;
  const page = await getTeamPage(read, parsed.id);
  if (!page) return null;
  return { read, page, requested: slug };
}

export async function generateMetadata(props: PageProps<"/team/[slug]">): Promise<Metadata> {
  const data = await load(props);
  if (!data) return {};
  const { team, competitions } = data.page;
  return {
    title: `${team.name}: uitslagen, programma en stand`,
    description: `${team.name}${competitions.length ? ` in ${competitions.map((c) => c.name).join(" en ")}` : ""}: recente uitslagen, komende wedstrijden en de positie in de stand.`,
    alternates: { canonical: teamPath(team) },
    ...(team.isPlaceholder ? { robots: { index: false, follow: false } } : {}),
  };
}

function Result({ match, teamId }: { match: MatchSummary; teamId: number }) {
  if (match.score.home === null || match.score.away === null || match.status === "abandoned") return null;
  const own = match.home.id === teamId ? match.score.home : match.score.away;
  const other = match.home.id === teamId ? match.score.away : match.score.home;
  const r = own > other ? "W" : own < other ? "V" : "G";
  const words = { W: "winst", G: "gelijkspel", V: "verlies" };
  return (
    <span className={`result-badge form-${r}`} style={{ background: r === "W" ? "var(--lime)" : r === "V" ? "var(--red)" : "#c9d1cb" }} title={words[r]}>
      {r}
    </span>
  );
}

export default async function TeamRoute(props: PageProps<"/team/[slug]">) {
  const data = await load(props);
  if (!data) notFound();
  const { page, requested } = data;
  const { team } = page;
  if (requested !== teamPath(team).slice("/team/".length)) permanentRedirect(teamPath(team));
  const cfg = config();
  const crumbs = [
    { name: "Vandaag", path: "/" },
    ...(page.competitions[0] ? [{ name: page.competitions[0].name, path: competitionPath(page.competitions[0].slug) }] : []),
    { name: team.name, path: teamPath(team) },
  ];
  const facts = [team.country, team.founded ? `opgericht ${team.founded}` : null, [team.venueName, team.venueCity].filter(Boolean).join(", ") || null].filter(Boolean);

  return (
    <div className="container layout layout-two">
      {isIndexable(cfg) && !team.isPlaceholder && <JsonLd data={breadcrumbLd(cfg, crumbs)} />}
      <div className="stack">
        <div>
          <Breadcrumbs items={crumbs} />
          <div className="spread">
            <div className="row" style={{ gap: 16 }}>
              <TeamCrest name={team.name} id={team.id} logoUrl={team.logoUrl} size="lg" />
              <div className="stack-sm" style={{ gap: 4 }}>
                <h1>{team.name}</h1>
                {facts.length > 0 && <p className="small muted">{facts.join(" · ")}</p>}
                {page.competitions.length > 0 && (
                  <p className="small">
                    {page.competitions.map((c, i) => (
                      <span key={c.id}>
                        {i > 0 && " · "}
                        <Link href={competitionPath(c.slug)} className="link">
                          {c.name}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </div>
            <FavoriteToggle kind="teams" id={team.id} name={team.name} withLabel />
          </div>
          {team.isPlaceholder && <p className="notice notice-info small">Dit is een plaatshouder voor een nog onbekende tegenstander in een knock-outschema.</p>}
        </div>

        {page.live.length > 0 && (
          <section className="group" aria-labelledby="live-kop">
            <h2 className="round-head" id="live-kop">
              Nu live
            </h2>
            <ul className="match-list">
              {page.live.map((m) => (
                <li key={m.id}>
                  <MatchRow match={m} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="group" aria-labelledby="komend-kop">
          <h2 className="round-head" id="komend-kop">
            Komende wedstrijden
          </h2>
          {page.upcoming.length === 0 ? (
            <p className="empty small">Geen komende wedstrijden bekend.</p>
          ) : (
            <ul className="match-list">
              {page.upcoming.map((m) => (
                <li key={m.id}>
                  <MatchRow match={m} showDate={formatDayShort(localDay(new Date(m.kickoffAt)))} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="group" aria-labelledby="recent-kop">
          <h2 className="round-head" id="recent-kop">
            Recente uitslagen
          </h2>
          {page.recent.length === 0 ? (
            <p className="empty small">Nog geen gespeelde wedstrijden in de opgeslagen seizoenen.</p>
          ) : (
            <ul className="match-list">
              {page.recent.map((m) => (
                <li key={m.id} style={{ display: "flex", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <MatchRow match={m} showDate={formatDayShort(localDay(new Date(m.kickoffAt)))} />
                  </div>
                  <span style={{ padding: "0 12px" }}>
                    <Result match={m} teamId={team.id} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <aside className="aside-context stack">
        {page.standings.map((s) => (
          <section className="card" key={s.competition.id} aria-label={`Stand ${s.competition.name}`}>
            <div className="card-head">
              <h2>
                <Link href={`${competitionPath(s.competition.slug)}/stand`}>Stand {s.competition.name}</Link>
              </h2>
            </div>
            <StandingsTable rows={s.rows} highlight={[team.id]} compact />
          </section>
        ))}
      </aside>
    </div>
  );
}
