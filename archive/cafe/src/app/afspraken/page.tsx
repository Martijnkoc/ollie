import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Empty } from "@/components/Empty";
import { viewer } from "@/lib/access";
import { phaseOf, datesFor } from "@/lib/dates/core";
import { getDb } from "@/lib/db";
import { invitesFor, inviteState } from "@/lib/invites";
import { formatShort } from "@/lib/time";

export const metadata: Metadata = { title: "Afspraken", robots: { index: false } };

const PHASE: Record<string, string> = {
  proposed: "Voorstel",
  upcoming: "Gepland",
  lobby: "Lobby open",
  live: "Bezig",
  ended: "Afgelopen",
  cancelled: "Afgezegd",
  declined: "Gaat niet door",
  no_show: "Niet doorgegaan",
  failed: "Niet doorgegaan",
};

export default async function DatesPage() {
  const v = await viewer();
  if (!v) redirect("/inloggen?next=/afspraken");
  const db = await getDb();
  const now = new Date();
  const [dates, invites] = await Promise.all([datesFor(db, v.user.id), v.member ? invitesFor(db, v.user.id) : Promise.resolve([])]);
  const toConfirm = invites.filter((i) => inviteState(i) === "accepted");
  const active = dates.filter((d) => ["proposed", "upcoming", "lobby", "live"].includes(phaseOf(d, now)));
  const past = dates.filter((d) => !active.includes(d));

  return (
    <div className="container narrow page stack-lg">
      <div className="row between">
        <h1 style={{ margin: 0 }}>Afspraken</h1>
        {v.community && (
          <Link className="btn secondary" href="/uitnodigen">
            Match uitnodigen
          </Link>
        )}
      </div>

      {v.restricted && (
        <p className="notice error">
          Je account is beperkt. <Link href="/beperkt">Meer informatie en bezwaar</Link>
        </p>
      )}

      {toConfirm.length > 0 && (
        <section className="stack" aria-labelledby="bevestigen">
          <h2 id="bevestigen">Bevestig wie er heeft geaccepteerd</h2>
          <ul className="list">
            {toConfirm.map((i) => (
              <li key={i.id}>
                <Link className="card lime card-link row between" href={`/uitnodigingen/${i.id}`}>
                  <span>
                    <strong>{i.guest_name}</strong> wil meedoen
                  </span>
                  <span className="badge lime">Bevestigen</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="stack" aria-labelledby="komend">
        <h2 id="komend">Komend</h2>
        {active.length === 0 ? (
          <Empty title="Nog niets gepland">
            <p>
              {v.community
                ? "Nodig een match uit of plan een videodate vanuit een privégesprek."
                : "Heb je een uitnodiging gekregen? Open de link uit je chat."}
            </p>
          </Empty>
        ) : (
          <ul className="list">
            {active.map((d) => (
              <li key={d.id}>
                <Link className="card flat card-link row between" href={`/afspraken/${d.id}`}>
                  <span>
                    <strong>{d.other_name}</strong>
                    <span className="muted small" style={{ display: "block" }}>
                      {formatShort(d.scheduled_at)} · Europe/Amsterdam
                    </span>
                  </span>
                  <span className={`badge ${phaseOf(d, now) === "lobby" ? "lime" : ""}`}>{PHASE[phaseOf(d, now)]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="stack" aria-labelledby="eerder">
          <h2 id="eerder">Eerder</h2>
          <ul className="list">
            {past.map((d) => (
              <li key={d.id}>
                <Link className="card flat card-link row between" href={`/afspraken/${d.id}`}>
                  <span>
                    {d.other_name} · <span className="muted">{formatShort(d.scheduled_at)}</span>
                  </span>
                  <span className="badge">{PHASE[phaseOf(d, now)]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
