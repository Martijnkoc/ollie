import Link from "next/link";
import { HeroStart } from "@/components/landing/HeroStart";
import { InteractiveDemo } from "@/components/landing/InteractiveDemo";
import { PlanIllustration } from "@/components/landing/PlanIllustration";
import { ScanDiagram } from "@/components/project/ScanDiagram";
import { EXAMPLE_PACK_M2, EXAMPLE_ROOMS, EXAMPLE_WASTE, exampleFloor } from "@/components/landing/example";
import { StatusBadge } from "@/components/StatusBadge";
import { BRAND, FAQ, PRICE } from "@/config/site";
import { formatCount, formatM2, formatPercent } from "@/lib/format";
import { STATUS_META, type Status } from "@/lib/projects/status";

const COMPARE: [string, boolean][] = [
  ["Adres met officiële BAG-gegevens", true],
  ["Plattegrond uitlezen, ruimtes opmeten en zelf controleren", true],
  ["Vloeroppervlakte per ruimte en totaal, met je eigen selectie", true],
  ["Vloerhoeveelheid met snijverlies en hele pakken", true],
  ["Verfcalculator voor je muren", true],
  ["Plinten per wand, met deuren en marge", false],
  ["Laminaat, PVC, tegels, ondervloer, profielen, primer en behang", false],
  ["Raamregister met ScanTag-maten in mm, foutmarge en status", false],
  ["Gordijnen, rolgordijnen, jaloezieën, plissés, vouwgordijnen, rolluiken: status per raam", false],
  ["PDF-rapport en CSV-bestellijst", false],
];

const AUDIENCE: [string, string][] = [
  ["Verhuizen", "Weet vóór de sleuteloverdracht hoeveel vloer, verf en raamdecoratie je nodig hebt, met de plattegrond van je makelaar."],
  ["Nieuw huis gekocht", "Eén overzicht van alle ruimtes en ramen, zodat je gericht kunt vergelijken en bestellen."],
  ["Renoveren", "Kies per klus welke ruimtes meedoen: vloer in de woonkamer, verf in de slaapkamers, niet in de badkamer."],
  ["Opnieuw inrichten", "Een raamregister met codes en meetstatus, zodat je niet vergeet welk raam je nog moet meten."],
  ["Verhuurder of kleine klusprofessional", "Snel een onderbouwde materiaallijst per woning, met aannames die je kunt laten zien."],
];

const Yes = () => (
  <span className="compare-yes">
    <span aria-hidden="true">✓</span>
    <span className="visually-hidden">inbegrepen</span>
  </span>
);
const No = () => (
  <span className="compare-no">
    <span aria-hidden="true">—</span>
    <span className="visually-hidden">niet inbegrepen</span>
  </span>
);

export default function Home() {
  const floor = exampleFloor();
  const included = EXAMPLE_ROOMS.filter((r) => r.included);
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">Voor verhuizen, een nieuw huis, verbouwen en opnieuw inrichten</p>
            <h1>{BRAND.tagline}</h1>
            <p className="hero-lead">
              Ontdek hoeveel vloer, verf en andere materialen je nodig hebt. Breng je ramen overzichtelijk in kaart en maak een rapport
              waarmee je zelf kunt shoppen.
            </p>
            <HeroStart />
          </div>

          <figure className="demo-stage" aria-label="Productvoorbeeld met een fictieve woning">
            <span className="badge badge-demo demo-tag">Voorbeeld · fictieve woning</span>
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
                Verf, plinten, materialen en ramen R01–R05 in het rapport
              </p>
            </div>
            <figcaption className="visually-hidden">
              Voorbeeldweergave: {included.length} geselecteerde ruimtes, samen {formatM2(floor.selectedNetM2)}, met{" "}
              {formatPercent(EXAMPLE_WASTE)} snijverlies {formatM2(floor.requiredM2 ?? 0)}.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="section section-alt" id="hoe-het-werkt">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Zo werkt het</p>
            <h2>In drie stappen van plattegrond naar bestellijst</h2>
            <p className="muted">Wij meten zoveel mogelijk uit je tekening. Jij controleert, past aan en bevestigt. Pas dan rekenen we.</p>
          </div>
          <ol className="steps">
            <li>
              <h3>Adres invullen</h3>
              <p className="muted">
                We zoeken je woning op in de officiële registratie (BAG via PDOK) en tonen wat daar echt bekend is, zoals bouwjaar en
                gebruiksoppervlakte. Een adres is optioneel en zegt niets over je kamers.
              </p>
            </li>
            <li>
              <h3>Plattegrond controleren</h3>
              <p className="muted">
                Upload de PDF of afbeelding van je makelaar. We meten de ruimtes langs de wanden, lezen de maatlijnen voor de schaal en
                zoeken ramen en deuren. Jij kiest welke ruimtes meetellen en bevestigt wat klopt.
              </p>
            </li>
            <li>
              <h3>Bestellijst downloaden</h3>
              <p className="muted">
                Gratis: vloer per kamer, hoeveelheid met snijverlies en pakken, en verf. Voor {PRICE.label} eenmalig: alle materialen,
                plinten en raamdecoratie per raam in één PDF en CSV.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section" id="scantag">
        <div className="container grid-2" style={{ alignItems: "center" }}>
          <div>
            <p className="eyebrow">ScanTag</p>
            <h2>Je ramen meten met je telefoon, zonder papier of rolmaat</h2>
            <p className="muted">
              Richt je telefoon op elke hoek van het raam en houd even stil. ScanTag gebruikt de AR-tracking van je telefoon om te weten
              waar die hoek in de ruimte zit, en geeft elke maat in millimeters met zijn foutmarge. Gewoon in je browser, geen app.
            </p>
            <ul className="ticks">
              <li>Breedte op drie hoogtes, hoogte op drie plekken, en de diepte van de dag</li>
              <li>Een onrustige of onlogische scan vragen we opnieuw, met de reden</li>
              <li>Er wordt geen foto gemaakt; alleen de vastgelegde punten gaan naar ons</li>
              <li>
                Werkt in Chrome op Android-telefoons met AR; op een iPhone of computer ga je via een QR-code verder op zo&apos;n telefoon
              </li>
            </ul>
            <p className="small muted" style={{ margin: 0 }}>
              Eerlijk: ScanTag-maten zijn nog niet gevalideerd tegen metingen in echte woningen. Tot dat gebeurd is, rekenen we er geen
              bestelmaat mee uit; je krijgt de gemeten opening met foutmarge.
            </p>
          </div>
          <div className="scantag-visual" aria-hidden="true">
            <ScanDiagram task="opening" />
          </div>
        </div>
      </section>

      <section className="section" id="demo">
        <div className="container grid-2" style={{ alignItems: "center" }}>
          <div>
            <p className="eyebrow">Probeer het</p>
            <h2>Jij bepaalt wat meetelt</h2>
            <p className="muted">
              Tik in het voorbeeld op een ruimte om hem mee te tellen of over te slaan, zoals je in de app de badkamer of het toilet uitzet.
              Het totaal rekent direct mee, met dezelfde rekenregels als in de app.
            </p>
            <ul className="ticks">
              <li>Ruimtes worden opgemeten langs de wanden op je tekening, ook L-vormen</li>
              <li>De schaal komt uit de maatlijnen op de tekening, en die moeten onderling kloppen</li>
              <li>Ramen krijgen een code (R01, R02 …); hun maten meet je met ScanTag</li>
              <li>Elke waarde houdt zijn label: herkend, door jou bevestigd, berekend of nog te meten</li>
            </ul>
          </div>
          <InteractiveDemo />
        </div>
      </section>

      <section className="section section-alt" id="prijs">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Gratis of compleet</p>
            <h2>De basis is gratis. Het complete rapport kost {PRICE.label}, één keer.</h2>
            <p className="muted">Geen abonnement, geen account nodig, geen adviesgesprek. Je gratis resultaat blijft gewoon zichtbaar.</p>
          </div>
          <div className="table-wrap">
            <table className="data compare">
              <caption className="visually-hidden">Vergelijking gratis en compleet rapport</caption>
              <thead>
                <tr>
                  <th scope="col">Wat je krijgt</th>
                  <th scope="col">
                    Gratis
                    <span className="compare-price">€ 0</span>
                  </th>
                  <th scope="col">
                    Compleet rapport
                    <span className="compare-price">
                      {PRICE.label} <small>{PRICE.period}</small>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(([what, free]) => (
                  <tr key={what}>
                    <th scope="row">{what}</th>
                    <td>{free ? <Yes /> : <No />}</td>
                    <td>
                      <Yes />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 20 }}>
            <Link href="/project/nieuw" className="btn btn-primary">
              Breng mijn woning in kaart
            </Link>
            <span className="tiny muted">
              {PRICE.vatNote}
              {PRICE.vatNoteVerified ? "" : " (concept: btw-behandeling wordt vóór de lancering bevestigd)"} Betalen met iDEAL en andere
              methoden via Mollie.
            </span>
          </div>
        </div>
      </section>

      <section className="section" id="voor-wie">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Voor wie</p>
            <h2>Voor iedereen die zelf wil kopen, zonder eerst alles op te meten</h2>
          </div>
          <div className="audience">
            {AUDIENCE.map(([title, text]) => (
              <article key={title} className="card-flat stack-sm">
                <h3 style={{ margin: 0 }}>{title}</h3>
                <p className="small muted" style={{ margin: 0 }}>
                  {text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="rapport">
        <div className="container grid-2" style={{ alignItems: "center" }}>
          <div>
            <p className="eyebrow">Het rapport</p>
            <h2>Een rapport dat je meeneemt naar de winkel</h2>
            <p className="muted">
              Per ruimte de vloer, per categorie je materialen, per raam je maten en wat er nog gemeten moet worden. Met een
              winkelchecklist, de gebruikte aannames en bij elk getal waar het vandaan komt.
            </p>
            <ul className="ticks">
              <li>Vloer, laminaat, PVC, tegels, ondervloer, verf, primer en behang met status per categorie</li>
              <li>Plinten per wand: omtrek, bevestigde deuropeningen eraf, marge, handelslengtes</li>
              <li>Een kaart per raam (R01, R02 …) met maten in mm, foutmarge, bron en bestelstatus</li>
              <li>Printvriendelijk A4 met paginanummers, en ook als CSV-bestellijst</li>
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

      <section className="section" id="nauwkeurigheid">
        <div className="container grid-2">
          <div>
            <p className="eyebrow">Eerlijk over nauwkeurigheid</p>
            <h2>We bluffen niet over maten</h2>
            <p className="muted">
              Een plattegrond van bovenaf vertelt niet hoe hoog je ramen zijn, en een adres onthult geen kamers. Daarom labelen we elk
              getal, vullen we nooit zelf iets in en zeggen we het als iets gemeten moet worden.
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
          <h2>Scheelt je een uur zoeken, meten, rekenen en lijstjes maken</h2>
          <p className="muted">
            Begin met je adres of direct met je plattegrond. Je kunt altijd stoppen; je project blijft op je eigen apparaat.
          </p>
          <Link href="/project/nieuw" className="btn btn-primary btn-lg">
            Breng mijn woning in kaart
          </Link>
        </div>
      </section>

      <div className="mobile-cta">
        <span className="small">
          <strong>Basis gratis</strong> · rapport {PRICE.label}
        </span>
        <Link href="/project/nieuw" className="btn btn-primary">
          Starten
        </Link>
      </div>
    </>
  );
}
