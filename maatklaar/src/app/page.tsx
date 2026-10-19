import Link from "next/link";
import { PlanIllustration } from "@/components/landing/PlanIllustration";
import { EXAMPLE_PACK_M2, EXAMPLE_ROOMS, EXAMPLE_WASTE, exampleFloor } from "@/components/landing/example";
import { StatusBadge } from "@/components/StatusBadge";
import { BRAND, FAQ, PRICE } from "@/config/site";
import { formatCount, formatM2, formatPercent } from "@/lib/format";
import { STATUS_META, type Status } from "@/lib/projects/status";

export default function Home() {
  const floor = exampleFloor();
  const included = EXAMPLE_ROOMS.filter((r) => r.included);
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">Voor verhuizen, verbouwen en opnieuw inrichten</p>
            <h1>{BRAND.tagline}</h1>
            <p className="hero-lead">
              Bereken gratis je vloer per kamer. Ontvang voor {PRICE.label} een compleet meet- en bestelrapport voor plinten en raamdecoratie. Geen afspraak, geen
              abonnement.
            </p>
            <div className="hero-cta">
              <Link href="/project/nieuw" className="btn btn-primary btn-lg">
                Begin gratis met mijn woning
              </Link>
              <Link href="#hoe-het-werkt" className="btn btn-lg">
                Zo werkt het
              </Link>
            </div>
            <ul className="price-strip" aria-label="Wat het kost">
              <li>Vloer per kamer: gratis</li>
              <li>
                Volledig rapport: {PRICE.label} {PRICE.period}
              </li>
              <li>Je plattegrond blijft op je apparaat</li>
            </ul>
          </div>

          <figure className="demo-stage" aria-label="Productvoorbeeld met een fictieve woning">
            <span className="badge badge-neutral demo-tag">Voorbeeld · fictieve woning</span>
            <div className="demo-plan">
              <PlanIllustration />
            </div>
            <div className="demo-list" aria-hidden="true">
              <h4>Bestellijst vloer</h4>
              <table>
                <tbody>
                  <tr>
                    <td>{included.length} ruimtes netto</td>
                    <td>{formatM2(floor.selectedNetM2)}</td>
                  </tr>
                  <tr>
                    <td>+ {formatPercent(EXAMPLE_WASTE)} snijverlies</td>
                    <td>{formatM2(floor.requiredM2 ?? 0)}</td>
                  </tr>
                  <tr>
                    <td>Pakken à {formatM2(EXAMPLE_PACK_M2, 3)}</td>
                    <td>{formatCount(floor.packs ?? 0)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="tiny muted" style={{ margin: "8px 0 0" }}>
                Plinten en raamregister R01–R05 in het volledige rapport
              </p>
            </div>
            <figcaption className="visually-hidden">
              Voorbeeldweergave: {included.length} geselecteerde ruimtes, samen {formatM2(floor.selectedNetM2)}, met {formatPercent(EXAMPLE_WASTE)} snijverlies{" "}
              {formatM2(floor.requiredM2 ?? 0)}.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="section section-alt" id="hoe-het-werkt">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">In drie stappen</p>
            <h2>Van plattegrond naar bestellijst</h2>
            <p className="muted">Wij lezen zoveel mogelijk uit je tekening. Jij controleert, past aan en bevestigt. Pas dan rekenen we.</p>
          </div>
          <ol className="steps">
            <li>
              <h3>Adres invoeren</h3>
              <p className="muted">
                We zoeken je woning op in de officiële registratie (BAG) en tonen wat daar bekend is, zoals bouwjaar en gebruiksoppervlakte. Een adres is optioneel.
              </p>
            </li>
            <li>
              <h3>Plattegrond uploaden en controleren</h3>
              <p className="muted">
                Upload de PDF of foto van je makelaar of bouwtekening. We zoeken kamernamen, maten en de schaal. Jij bevestigt of corrigeert elke kamer, of tekent hem zelf.
              </p>
            </li>
            <li>
              <h3>Gratis berekenen of volledig rapport</h3>
              <p className="muted">
                Zie direct de vloer per kamer en het totaal met snijverlies. Voor {PRICE.label} krijg je er plinten, een raamregister en een meetblad voor raamdecoratie bij, in
                één PDF.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section" id="rapport">
        <div className="container grid-2" style={{ alignItems: "center" }}>
          <div>
            <p className="eyebrow">Het rapport</p>
            <h2>Een rapport dat je meeneemt naar de winkel</h2>
            <p className="muted">
              Per ruimte de vloer, per wand de plinten, per raam je ruwe maten en wat er nog gemeten moet worden. Met een winkelchecklist, de gebruikte aannames en bij elk
              getal waar het vandaan komt.
            </p>
            <ul className="ticks">
              <li>Vloertabel met snijverlies en pakken (als je de pakinhoud opgeeft)</li>
              <li>Plinten: omtrek, bevestigde deuropeningen eraf, marge, handelslengtes</li>
              <li>Raamregister R01, R02 … met meetblad per raam, in millimeters</li>
              <li>Printvriendelijk A4 en ook als CSV-bestellijst</li>
            </ul>
          </div>
          <div className="report-mock" aria-label="Voorbeeldweergave van het PDF-rapport" role="img">
            <div className="paper" aria-hidden="true">
              <span className="tiny muted">Meet- en bestelrapport · voorbeeld</span>
              <h5>Fictieve woning</h5>
              <table>
                <thead>
                  <tr>
                    <th>Ruimte</th>
                    <th className="r">Netto</th>
                  </tr>
                </thead>
                <tbody>
                  {included.slice(0, 6).map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td className="r">{formatM2(r.areaM2)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <strong>Benodigd incl. {formatPercent(EXAMPLE_WASTE)}</strong>
                    </td>
                    <td className="r">
                      <strong>{formatM2(floor.requiredM2 ?? 0)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="paper" aria-hidden="true">
              <span className="tiny muted">Raamregister</span>
              <table>
                <thead>
                  <tr>
                    <th>Raam</th>
                    <th>Product</th>
                    <th className="r">Breedte</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>R01</td>
                    <td>Plissé, in de dag</td>
                    <td className="r">1203 · 1201 · 1202</td>
                    <td>Bevestigd</td>
                  </tr>
                  <tr>
                    <td>R02</td>
                    <td>Rolgordijn</td>
                    <td className="r">—</td>
                    <td>Nog meten</td>
                  </tr>
                  <tr>
                    <td>R03</td>
                    <td>Gordijn, wand</td>
                    <td className="r">rail 2200</td>
                    <td>Ingevoerd</td>
                  </tr>
                </tbody>
              </table>
              <span className="tiny muted">Bestelmaat: volgens de meetinstructie van je leverancier.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-alt" id="prijs">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Prijs</p>
            <h2>Gratis waar het kan, eenmalig waar het meer is</h2>
          </div>
          <div className="pricing">
            <article className="plan-card">
              <h3>Vloer</h3>
              <div className="plan-price">
                € 0<small>gratis</small>
              </div>
              <ul className="ticks">
                <li>Adres en officiële woninggegevens</li>
                <li>Plattegrond uploaden, kamers controleren en tekenen</li>
                <li>Vloeroppervlakte per kamer en totaal van je selectie</li>
                <li>Snijverlies en aantal pakken</li>
                <li className="no">Geen plinten, raamregister of PDF-rapport</li>
              </ul>
              <Link href="/project/nieuw" className="btn">
                Begin gratis
              </Link>
            </article>
            <article className="plan-card featured">
              <h3>Volledig meet- en bestelrapport</h3>
              <div className="plan-price">
                {PRICE.label}
                <small>{PRICE.period}, per woningproject</small>
              </div>
              <ul className="ticks">
                <li>Alles van gratis</li>
                <li>Plinten per ruimte en per wand, met deuren en marge</li>
                <li>Raamregister met begeleid meetprotocol per raam</li>
                <li>Persoonlijk PDF-rapport en CSV-bestellijst</li>
                <li>Geen abonnement, geen extra's achteraf</li>
              </ul>
              <Link href="/project/nieuw" className="btn btn-primary">
                Begin gratis, beslis later
              </Link>
              <p className="tiny muted" style={{ margin: 0 }}>
                {PRICE.vatNote}
                {PRICE.vatNoteVerified ? "" : " (concept: btw-behandeling wordt vóór de lancering bevestigd)"} Betalen met iDEAL en andere methoden via Mollie.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section" id="nauwkeurigheid">
        <div className="container grid-2">
          <div>
            <p className="eyebrow">Eerlijk over nauwkeurigheid</p>
            <h2>We bluffen niet over maten</h2>
            <p className="muted">
              Een plattegrond van bovenaf vertelt niet hoe hoog je ramen zijn, en een adres onthult geen kamers. Daarom labelen we elk getal, vullen we nooit zelf iets in en
              zeggen we het als iets gemeten moet worden.
            </p>
          </div>
          <div className="status-legend">
            {(["auto", "confirmed", "derived", "missing"] as Status[]).map((s) => (
              <div key={s} className="card-flat stack-sm">
                <StatusBadge status={s} />
                <span className="small muted">{STATUS_META[s].description}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt" id="vragen">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Veelgestelde vragen</p>
            <h2>Goed om te weten</h2>
          </div>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ textAlign: "center" }}>
          <h2>Bespaar jezelf een uur meet- en rekenwerk</h2>
          <p className="muted">Begin met je adres of direct met je plattegrond. Je kunt altijd stoppen; je project blijft op je eigen apparaat.</p>
          <Link href="/project/nieuw" className="btn btn-primary btn-lg">
            Begin gratis met mijn woning
          </Link>
        </div>
      </section>

      <div className="mobile-cta">
        <span className="small">
          <strong>Gratis</strong> vloer · rapport {PRICE.label}
        </span>
        <Link href="/project/nieuw" className="btn btn-primary">
          Begin gratis
        </Link>
      </div>
    </>
  );
}
