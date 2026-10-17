import Link from "next/link";
import { config } from "@/lib/env";
import { siteStatus } from "@/lib/data";
import { getCompetitions, getDayBoard, type ReadContext } from "@/lib/football/queries";
import { addDays } from "@/lib/time";
import { AdSlot } from "./AdSlot";
import { CompetitionNav } from "./CompetitionNav";
import { DayNav } from "./DayNav";
import { LiveBoard } from "./LiveBoard";
import { SyncTime } from "./SyncTime";

/** The day overview used by the homepage (today) and /wedstrijden/[datum]. */
export async function DayView({ read, day, today }: { read: ReadContext | null; day: string; today: string }) {
  const cfg = config();
  if (!read) {
    return (
      <div className="container page">
        <DayNav day={day} today={today} />
        <div className="notice notice-warn">
          <strong>Er is nog geen voetbaldatabron gekoppeld.</strong>
          <p className="small">
            Voetbalradar toont alleen echte gegevens van een gelicentieerde databron en vult niets aan met voorbeeldscores. Zolang de koppeling ontbreekt, blijft dit
            overzicht leeg. Beheerders vinden de stappen in de README onder &ldquo;Databron koppelen&rdquo;.
          </p>
        </div>
      </div>
    );
  }
  const [board, competitions, status] = await Promise.all([getDayBoard(read, day), getCompetitions(read), siteStatus(read.db, read.cfg, read.now)]);
  const recentDay = day >= addDays(today, -1);

  return (
    <div className="container layout">
      <aside className="aside-nav">
        <CompetitionNav competitions={competitions} />
      </aside>
      <div>
        <DayNav day={day} today={today} />
        {competitions.length === 0 && (
          <div className="notice notice-info" style={{ marginBottom: 12 }}>
            <strong>De eerste synchronisatie heeft nog niet plaatsgevonden.</strong>
            <p className="small">Zodra de databron is uitgelezen verschijnen hier de wedstrijden.</p>
          </div>
        )}
        <LiveBoard day={day} initial={board.matches} lastSync={status.lastSync} pollSeconds={Math.max(15, cfg.livePollSeconds)} pollable={recentDay} />
      </div>
      <aside className="aside-context stack">
        <section className="card" aria-labelledby="data-status">
          <div className="card-head">
            <h2 id="data-status">Actualiteit</h2>
            <span className={`badge ${status.degraded ? "badge-warn" : "badge-ok"}`}>{status.degraded ? "achter" : "bijgewerkt"}</span>
          </div>
          <div className="card-body stack-sm small">
            <SyncTime iso={status.lastLiveSync} prefix="Live-gegevens" />
            <SyncTime iso={status.lastSync} prefix="Programma" />
            <p className="dim">
              Bron: {status.providerLabel}. Scores die langer dan een paar minuten niet zijn bevestigd, krijgen het label &ldquo;verouderd?&rdquo;.
            </p>
            <Link href="/status" className="link small">
              Synchronisatiestatus
            </Link>
          </div>
        </section>
        <AdSlot position="home-aside" />
        <section className="card">
          <div className="card-body stack-sm small muted">
            <h2 style={{ fontSize: "0.9rem", color: "var(--text)" }}>Over deze gegevens</h2>
            <p>Statistieken die de databron niet levert, tonen we als &ldquo;niet beschikbaar&rdquo; en nooit als nul. Uitgestelde en afgelaste wedstrijden krijgen geen score.</p>
            <Link href="/over" className="link">
              Meer over Voetbalradar
            </Link>
          </div>
        </section>
      </aside>
    </div>
  );
}
