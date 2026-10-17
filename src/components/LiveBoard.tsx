"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatchSummary } from "@/lib/football/model";
import { isFinished, isLive, statusCategory } from "@/lib/football/status";
import { useFavorites } from "@/lib/favorites";
import { CompetitionGroup, groupByCompetition } from "./CompetitionGroup";
import { SyncTime } from "./SyncTime";

type Tab = "all" | "live" | "upcoming" | "finished" | "favorites";

interface Props {
  day: string;
  initial: MatchSummary[];
  lastSync: string | null;
  pollSeconds: number;
  /** Past days with only final results do not need polling. */
  pollable: boolean;
}

interface DayResponse {
  matches: MatchSummary[];
  lastSync: string | null;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "live", label: "Live" },
  { key: "upcoming", label: "Nog te spelen" },
  { key: "finished", label: "Afgelopen" },
  { key: "favorites", label: "Favorieten" },
];

function inTab(m: MatchSummary, tab: Tab) {
  const c = statusCategory(m.status);
  if (tab === "live") return c === "live";
  if (tab === "upcoming") return c === "upcoming";
  if (tab === "finished") return c === "finished" || c === "off";
  return true;
}

/**
 * Today's (or any day's) matches with filters, refreshed automatically: every `pollSeconds`
 * while something is live, every two minutes otherwise, paused in a background tab, with
 * back-off on errors and an explicit offline state. The server-rendered list is the initial state.
 */
export function LiveBoard({ day, initial, lastSync: initialSync, pollSeconds, pollable }: Props) {
  const [matches, setMatches] = useState(initial);
  const [lastSync, setLastSync] = useState(initialSync);
  const [tab, setTab] = useState<Tab>("all");
  const [onlyCompetitions, setOnlyCompetitions] = useState<number[]>([]);
  const [failed, setFailed] = useState(0);
  const [offline, setOffline] = useState(false);
  const { favorites } = useFavorites();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const anyLive = matches.some((m) => isLive(m.status));
  const allFinal = matches.length > 0 && matches.every((m) => isFinished(m.status) || statusCategory(m.status) === "off");
  const shouldPoll = pollable && !(allFinal && !anyLive);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/day/${day}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as DayResponse;
      setMatches(data.matches);
      setLastSync(data.lastSync);
      setFailed(0);
      setOffline(false);
    } catch {
      setFailed((n) => n + 1);
      if (typeof navigator !== "undefined" && !navigator.onLine) setOffline(true);
    }
  }, [day]);

  useEffect(() => {
    if (!shouldPoll) return;
    const base = (anyLive ? pollSeconds : 120) * 1000;
    const delay = failed > 0 ? Math.min(base * 2 ** failed, 5 * 60_000) : base;
    const schedule = () => {
      timer.current = setTimeout(async () => {
        if (document.visibilityState === "visible") await refresh();
        else schedule();
      }, delay);
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (timer.current) clearTimeout(timer.current);
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [shouldPoll, anyLive, pollSeconds, failed, refresh, matches]);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      void refresh();
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [refresh]);

  const competitions = useMemo(() => groupByCompetition(matches).map((g) => ({ ...g.competition, count: g.matches.length })), [matches]);
  const visible = useMemo(
    () =>
      matches.filter((m) => {
        if (onlyCompetitions.length > 0 && !onlyCompetitions.includes(m.competition.id)) return false;
        if (tab === "favorites")
          return favorites.teams.includes(m.home.id) || favorites.teams.includes(m.away.id) || favorites.competitions.includes(m.competition.id);
        return inTab(m, tab);
      }),
    [matches, tab, onlyCompetitions, favorites],
  );
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, t.key === "favorites" ? null : matches.filter((m) => inTab(m, t.key)).length])), [matches]);
  const groups = groupByCompetition(visible);

  return (
    <div>
      <div className="board-toolbar">
        <div className="tabs" role="group" aria-label="Filter op status">
          {TABS.map((t) => (
            <button key={t.key} type="button" aria-pressed={tab === t.key} aria-controls="board-list" onClick={() => setTab(t.key)}>
              {t.key === "live" && anyLive && <span className="live-dot" aria-hidden="true" />}
              {t.label}
              {counts[t.key] !== null && <span className="dim"> {counts[t.key]}</span>}
            </button>
          ))}
        </div>
        {competitions.length > 1 && (
          <div className="chips" role="group" aria-label="Filter op competitie">
            {competitions.map((c) => {
              const on = onlyCompetitions.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="chip"
                  aria-pressed={on}
                  onClick={() => setOnlyCompetitions((list) => (on ? list.filter((x) => x !== c.id) : [...list, c.id]))}
                >
                  {c.name} <span className="chip-count">{c.count}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="board-meta">
          <SyncTime iso={lastSync} prefix="Laatste synchronisatie met de databron" />
          {shouldPoll ? <span>Ververst automatisch{anyLive ? ` elke ${pollSeconds} s` : ""}</span> : <span>Alle uitslagen zijn definitief</span>}
        </div>
        <div aria-live="polite">
          {offline && (
            <div className="notice notice-warn small">
              <strong>Je bent offline.</strong> De scores hieronder zijn van het laatste moment dat je verbinding had en worden niet bijgewerkt.
            </div>
          )}
          {!offline && failed > 0 && (
            <div className="notice notice-warn small">
              <strong>Verversen lukt even niet.</strong> We proberen het automatisch opnieuw. Wat je ziet is mogelijk niet actueel.
            </div>
          )}
        </div>
      </div>

      <div id="board-list">
        {groups.length === 0 ? (
          <div className="card empty">
            {matches.length === 0 ? (
              <p>Geen wedstrijden op deze dag in de competities die we volgen.</p>
            ) : tab === "favorites" ? (
              <>
                <p>Geen wedstrijden van je favorieten op deze dag.</p>
                <p className="small dim">Markeer een competitie of club met de ster om hem hier te zien.</p>
              </>
            ) : (
              <p>Geen wedstrijden binnen dit filter.</p>
            )}
          </div>
        ) : (
          groups.map((g) => <CompetitionGroup key={g.competition.id} competition={g.competition} matches={g.matches} />)
        )}
      </div>
    </div>
  );
}
