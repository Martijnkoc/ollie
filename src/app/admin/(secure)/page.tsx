import { getStats, requireAdmin } from "@/lib/admin";
import { CAFE, LAUNCH_REGIONS, REGIONS, label } from "@/lib/config";
import { getDb } from "@/lib/db";

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "–");

function Stat({ label: text, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="stat">
      <div className="label">{text}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export default async function AdminHome() {
  await requireAdmin();
  const s = await getStats(await getDb());
  const helpedTotal = (s.helped.yes ?? 0) + (s.helped.somewhat ?? 0) + (s.helped.no ?? 0);

  return (
    <>
      <section className="card stack">
        <p className="eyebrow">Hoofdvraag</p>
        <h1 style={{ fontSize: "1.6rem" }}>Heeft dit gesprek je geholpen te bepalen of je in het echt wilt afspreken?</h1>
        <div className="hero-figure">{pct(s.helped.yes ?? 0, helpedTotal)}</div>
        <p className="muted" style={{ margin: 0 }}>
          antwoordt &lsquo;ja&rsquo; ({helpedTotal} antwoorden). Ook na een wederzijds &lsquo;nee&rsquo; kan dit ja zijn: dan deed
          het gesprek zijn werk.
        </p>
        <div className="grid-3">
          <Stat label="Ja" value={s.helped.yes ?? 0} sub={pct(s.helped.yes ?? 0, helpedTotal)} />
          <Stat label="Een beetje" value={s.helped.somewhat ?? 0} sub={pct(s.helped.somewhat ?? 0, helpedTotal)} />
          <Stat label="Nee" value={s.helped.no ?? 0} sub={pct(s.helped.no ?? 0, helpedTotal)} />
        </div>
      </section>

      <section className="stack">
        <h2>Videodates</h2>
        <div className="grid-3">
          <Stat label="Uitnodigingen" value={s.invites} sub={`${pct(s.invitesAccepted, s.invites)} aangenomen`} />
          <Stat label="Gepland" value={s.dates} sub={`${s.datesCancelled} afgezegd`} />
          <Stat label="Gehouden (beiden binnen)" value={s.datesHeld} />
          <Stat label="Keuzes gemaakt" value={s.decisions} sub={`${pct(s.decisionsYes, s.decisions)} wil verder`} />
          <Stat label="Wederzijdse interesse" value={s.mutual} sub={`${s.contactShared} keer contact gedeeld`} />
          <Stat label="Open meldingen" value={s.openReports} />
        </div>
      </section>

      <section className="stack">
        <h2>Community</h2>
        <div className="grid-3">
          <Stat label="Aanmeldingen" value={s.members} sub={`${s.membersVisible} staan aan voor voorstellen`} />
          <Stat label="Via een videodate binnengekomen" value={s.membersFromDates} />
          <Stat label="Cafe-wachtlijst" value={s.cafeWaitlist} sub={CAFE.open ? "Cafe is open" : "Cafe nog dicht"} />
        </div>
        {s.regions.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Regio</th>
                  <th>Aanmeldingen</th>
                  <th>Zichtbaar</th>
                </tr>
              </thead>
              <tbody>
                {s.regions.map((r) => (
                  <tr key={r.region}>
                    <td>
                      {label(REGIONS, r.region)} {LAUNCH_REGIONS.includes(r.region) && <span className="badge accent">startregio</span>}
                    </td>
                    <td>{r.n}</td>
                    <td>{r.visible}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
