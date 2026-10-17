import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AdSlot } from "@/components/AdSlot";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { JsonLd } from "@/components/JsonLd";
import { MatchesByRound } from "@/components/MatchesByRound";
import { StandingsTable } from "@/components/StandingsTable";
import { readContext } from "@/lib/data";
import { config } from "@/lib/env";
import { currentRound, getCompetitionPage, getSeasonMatches, getStandings, type CompetitionPage } from "@/lib/football/queries";
import { isLive, isUpcoming } from "@/lib/football/status";
import { breadcrumbLd, isIndexable } from "@/lib/seo";
import { competitionPath } from "@/lib/slug";
import { formatDate, formatTime, shortSeasonName } from "@/lib/time";

const TABS = [
  { key: "", label: "Overzicht" },
  { key: "uitslagen", label: "Uitslagen" },
  { key: "programma", label: "Programma" },
  { key: "stand", label: "Stand" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const SEASON_RE = /^\d{4}-\d{2,4}$/;

function parseRest(rest: string[] | undefined): { season?: string; tab: TabKey } | null {
  const parts = rest ?? [];
  if (parts.length > 2) return null;
  let season: string | undefined;
  let i = 0;
  if (parts[0] && SEASON_RE.test(parts[0])) {
    season = parts[0];
    i = 1;
  }
  const tab = parts[i] ?? "";
  if (parts.length > i + 1 || !TABS.some((t) => t.key === tab)) return null;
  return { season, tab: tab as TabKey };
}

function path(page: CompetitionPage, tab: TabKey, seasonSlug?: string) {
  const seasonPart = seasonSlug && seasonSlug !== page.seasons.find((s) => s.isCurrent)?.slug ? `/${seasonSlug}` : "";
  return `${competitionPath(page.competition.slug)}${seasonPart}${tab ? `/${tab}` : ""}`;
}

async function load(props: PageProps<"/competitie/[slug]/[[...rest]]">) {
  const { slug, rest } = await props.params;
  const parsed = parseRest(rest);
  if (!parsed) return null;
  const read = await readContext();
  if (!read) return null;
  const page = await getCompetitionPage(read, slug, parsed.season);
  if (!page) return null;
  return { read, page, ...parsed };
}

export async function generateMetadata(props: PageProps<"/competitie/[slug]/[[...rest]]">): Promise<Metadata> {
  const data = await load(props);
  if (!data) return {};
  const { page, tab } = data;
  const name = page.competition.name;
  const season = shortSeasonName(page.season.name);
  const what = { "": "programma, uitslagen en stand", uitslagen: "uitslagen", programma: "programma", stand: "stand" }[tab];
  const label = { "": "", uitslagen: "Uitslagen ", programma: "Programma ", stand: "Stand " }[tab];
  return {
    title: `${label}${name} ${season}`.trim(),
    description: `${name} ${season}: ${what}, per speelronde en altijd met de actualiteit van de gegevens erbij.`,
    alternates: { canonical: path(page, tab, page.season.slug) },
  };
}

export default async function CompetitionRoute(props: PageProps<"/competitie/[slug]/[[...rest]]">) {
  const data = await load(props);
  if (!data) notFound();
  const { read, page, tab, season: requestedSeason } = data;
  // The current season lives at the URL without a season segment; keep one canonical address.
  if (requestedSeason && page.season.isCurrent) permanentRedirect(path(page, tab));

  const cfg = config();
  const seasonPath = (t: TabKey) => path(page, t, page.season.slug);
  const crumbs = [
    { name: "Vandaag", path: "/" },
    { name: "Competities", path: "/competities" },
    { name: page.competition.name, path: competitionPath(page.competition.slug) },
  ];

  let body: React.ReactNode;
  if (tab === "stand") {
    const rows = await getStandings(read, page.season.id);
    body = rows.length ? (
      <section className="card">
        <StandingsTable rows={rows} caption={`Stand ${page.competition.name}`} />
        <p className="tiny dim card-body">
          Stand zoals geleverd door de databron
          {page.season.standingsSyncedAt ? `, gecontroleerd ${formatDate(page.season.standingsSyncedAt)} ${formatTime(page.season.standingsSyncedAt)}` : ""}. Bij gelijke
          punten gelden de officiële competitieregels.
        </p>
      </section>
    ) : (
      <div className="card empty">
        {page.season.standingsAvailable === false ? "De databron levert voor dit seizoen geen stand (bijvoorbeeld bij een knock-outtoernooi)." : "De stand is nog niet beschikbaar."}
      </div>
    );
  } else if (tab === "uitslagen") {
    body = <MatchesByRound matches={await getSeasonMatches(read, page.season.id, "results")} emptyText="Nog geen gespeelde wedstrijden in dit seizoen." />;
  } else if (tab === "programma") {
    body = <MatchesByRound matches={await getSeasonMatches(read, page.season.id, "fixtures")} emptyText="Geen wedstrijden meer gepland in dit seizoen." />;
  } else {
    const all = await getSeasonMatches(read, page.season.id, "all");
    const round = currentRound(all, read.now);
    const roundMatches = round ? all.filter((m) => m.roundName === round) : [];
    const upcoming = all.filter((m) => isUpcoming(m.status) || isLive(m.status)).slice(0, 10);
    const recent = all
      .filter((m) => !isUpcoming(m.status) && !isLive(m.status) && new Date(m.kickoffAt) < read.now)
      .slice(-10)
      .reverse();
    const rows = await getStandings(read, page.season.id);
    body = (
      <div className="stack">
        {roundMatches.length > 0 ? (
          <MatchesByRound matches={roundMatches} emptyText="" />
        ) : (
          <MatchesByRound matches={upcoming} emptyText="Geen komende wedstrijden bekend." />
        )}
        {rows.length > 0 && (
          <section className="card" aria-labelledby="stand-kop">
            <div className="card-head">
              <h2 id="stand-kop">Stand</h2>
              <Link href={seasonPath("stand")} className="small link">
                Volledige stand
              </Link>
            </div>
            <StandingsTable rows={rows} />
          </section>
        )}
        {recent.length > 0 && (
          <section aria-labelledby="recent-kop" className="stack-sm">
            <div className="spread">
              <h2 id="recent-kop">Laatste uitslagen</h2>
              <Link href={seasonPath("uitslagen")} className="small link">
                Alle uitslagen
              </Link>
            </div>
            <MatchesByRound matches={recent} emptyText="" />
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="container layout layout-two">
      {isIndexable(cfg) && <JsonLd data={breadcrumbLd(cfg, crumbs)} />}
      <div>
        <Breadcrumbs items={crumbs} />
        <div className="page-head">
          <span className="eyebrow">{page.competition.country}</span>
          <div className="spread">
            <h1>
              {page.competition.name} <span className="muted">{shortSeasonName(page.season.name)}</span>
            </h1>
            <FavoriteToggle kind="competitions" id={page.competition.id} name={page.competition.name} withLabel />
          </div>
          {page.seasons.length > 1 && (
            <nav className="season-select" aria-label="Seizoen">
              <span className="dim">Seizoen:</span>
              {page.seasons.map((s) => (
                <Link key={s.id} href={path(page, tab, s.slug)} aria-current={s.id === page.season.id ? "page" : undefined}>
                  {shortSeasonName(s.name)}
                </Link>
              ))}
            </nav>
          )}
          {!page.season.isCurrent && <p className="small dim">Je bekijkt een eerder seizoen.</p>}
        </div>
        <nav className="tabs" aria-label="Onderdelen" style={{ marginBottom: 16 }}>
          {TABS.map((t) => (
            <Link key={t.key} href={seasonPath(t.key)} aria-current={t.key === tab ? "page" : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
        {body}
      </div>
      <aside className="aside-context stack">
        <AdSlot position="competition-aside" />
        <section className="card">
          <div className="card-body small muted stack-sm">
            <h2 style={{ fontSize: "0.9rem", color: "var(--text)" }}>Bron en actualiteit</h2>
            <p>Wedstrijden, uitslagen en stand komen van de databron en worden automatisch bijgewerkt. Live-scores verversen tijdens wedstrijden elke {cfg.livePollSeconds} seconden.</p>
          </div>
        </section>
      </aside>
    </div>
  );
}
