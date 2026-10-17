"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MatchSummary } from "@/lib/football/model";
import { useFavorites } from "@/lib/favorites";
import { formatDayShort, localDay } from "@/lib/time";
import { FavoriteToggle } from "./FavoriteToggle";
import { MatchRow } from "./MatchRow";

interface Ref {
  id: number;
  name: string;
  path: string;
}

interface Data {
  teams: Ref[];
  competitions: Ref[];
  live: MatchSummary[];
  upcoming: MatchSummary[];
  recent: MatchSummary[];
}

function List({ title, matches }: { title: string; matches: MatchSummary[] }) {
  if (matches.length === 0) return null;
  return (
    <section className="group" aria-label={title}>
      <h2 className="round-head">{title}</h2>
      <ul className="match-list">
        {matches.map((m) => (
          <li key={m.id}>
            <MatchRow match={m} showDate={formatDayShort(localDay(new Date(m.kickoffAt)))} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FavoritesView() {
  const { favorites } = useFavorites();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const key = `${favorites.teams.join(",")}|${favorites.competitions.join(",")}`;
  const empty = favorites.teams.length === 0 && favorites.competitions.length === 0;

  useEffect(() => {
    if (empty) return;
    let cancelled = false;
    const params = new URLSearchParams({
      teams: [...favorites.teams].sort((a, b) => a - b).join(","),
      competitions: [...favorites.competitions].sort((a, b) => a - b).join(","),
    });
    fetch(`/api/v1/favorites?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Data) => !cancelled && (setData(d), setError(false)))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the favourites
  }, [key, empty]);

  if (empty) {
    return (
      <div className="card empty">
        <p>Je hebt nog geen favorieten.</p>
        <p className="small dim">
          Tik op de ster bij een competitie of op &ldquo;Volgen&rdquo; bij een club. Je favorieten worden alleen in deze browser bewaard.
        </p>
      </div>
    );
  }
  if (error) return <div className="notice notice-warn small">Je favorieten konden niet worden geladen. Probeer het later opnieuw.</div>;
  if (!data) return <div className="skeleton" style={{ height: 160 }} role="status" aria-busy="true" aria-label="Favorieten laden" />;
  const nothing = data.live.length + data.upcoming.length + data.recent.length === 0;
  return (
    <div className="stack">
      <section className="card">
        <div className="card-body stack-sm">
          <h2 style={{ fontSize: "0.9rem" }}>Je volgt</h2>
          <ul className="chips" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {[
              ...data.competitions.map((c) => ({ ...c, kind: "competitions" as const })),
              ...data.teams.map((t) => ({ ...t, kind: "teams" as const })),
            ].map((f) => (
              <li key={`${f.kind}-${f.id}`} className="chip" style={{ paddingRight: 2 }}>
                <Link href={f.path}>{f.name}</Link>
                <FavoriteToggle kind={f.kind} id={f.id} name={f.name} />
              </li>
            ))}
          </ul>
        </div>
      </section>
      {nothing && <div className="card empty">Geen wedstrijden van je favorieten in de afgelopen week of de komende twee weken.</div>}
      <List title="Nu live" matches={data.live} />
      <List title="Komende wedstrijden" matches={data.upcoming} />
      <List title="Recente uitslagen" matches={data.recent} />
    </div>
  );
}
