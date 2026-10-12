import type { Metadata } from "next";
import { requireStaff } from "@/lib/access";
import { getDb } from "@/lib/db";
import { stats } from "@/lib/stats";

export const metadata: Metadata = { title: "Beheer", robots: { index: false } };

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "–");

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export default async function StaffHome() {
  await requireStaff();
  const s = await stats(await getDb());
  const total = (s.helped.yes ?? 0) + (s.helped.somewhat ?? 0) + (s.helped.no ?? 0);
  return (
    <>
      <h1>Overzicht</h1>
      <section className="card stack" aria-labelledby="hoofdvraag">
        <p className="eyebrow" id="hoofdvraag">
          Hoofdvraag
        </p>
        <h2 style={{ fontSize: "1.3rem" }}>Heeft dit gesprek je geholpen te bepalen of je in het echt wilt afspreken?</h2>
        <div className="hero-figure">{pct(s.helped.yes ?? 0, total)}</div>
        <p className="muted" style={{ margin: 0 }}>
          antwoordt &lsquo;ja&rsquo; ({total} antwoorden). Alleen totalen; individuele antwoorden tonen we hier niet.
        </p>
        <div className="grid-3">
          <Stat label="Ja" value={s.helped.yes ?? 0} sub={pct(s.helped.yes ?? 0, total)} />
          <Stat label="Een beetje" value={s.helped.somewhat ?? 0} sub={pct(s.helped.somewhat ?? 0, total)} />
          <Stat label="Nee" value={s.helped.no ?? 0} sub={pct(s.helped.no ?? 0, total)} />
        </div>
      </section>
      <section className="grid-3" aria-label="Kerncijfers">
        <Stat label="Accounts" value={s.users} sub={`${s.profiles} met profiel`} />
        <Stat label="Betalende leden" value={s.members} />
        <Stat label="Videodates gehouden" value={s.datesHeld} sub={`${s.noShows} niet doorgegaan`} />
        <Stat label="Gepland of bezig" value={s.datesScheduled} />
        <Stat label="Wederzijdse interesse" value={s.mutual} />
        <Stat label="Berichten (7 dagen)" value={s.messages} />
        <Stat label="Open meldingen" value={s.openReports} />
        <Stat label="Open bezwaren" value={s.openAppeals} />
        <Stat label="Beperkte accounts" value={s.restricted} />
      </section>
    </>
  );
}
