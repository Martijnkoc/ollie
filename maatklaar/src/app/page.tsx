import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/brand/Icon";
import { LogoMark } from "@/components/brand/Logo";
import { PricingBlock } from "@/components/brand/PricingBlock";
import { HeroStart } from "@/components/landing/HeroStart";
import { InteractiveDemo } from "@/components/landing/InteractiveDemo";
import { PlanIllustration } from "@/components/landing/PlanIllustration";
import { EXAMPLE_PACK_M2, EXAMPLE_ROOMS, EXAMPLE_WASTE, EXAMPLE_WINDOWS, exampleFloor } from "@/components/landing/example";
import { ScanDiagram } from "@/components/project/ScanDiagram";
import { JsonLd } from "@/components/seo/JsonLd";
import { StatusBadge } from "@/components/StatusBadge";
import { BRAND, FAQ, PRICE, siteUrl } from "@/config/site";
import { GUIDE_INDEX } from "@/content/guide-index";
import { formatCount, formatM2, formatPercent } from "@/lib/format";
import { STATUS_META, type Status } from "@/lib/projects/status";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: BRAND.name,
    locale: BRAND.locale,
    title: `${BRAND.name} · ${BRAND.tagline}`,
    description: BRAND.description,
  },
};

const STEPS: { icon: IconName; title: string; text: string; auto: string; you: string }[] = [
  {
    icon: "pin",
    title: "Adres",
    text: "We zoeken je woning op in de officiële Basisregistratie Adressen en Gebouwen (BAG).",
    auto: "Bouwjaar en gebruiksoppervlakte van de hele woning.",
    you: "Niets: een adres zegt niets over je kamers. Het mag ook leeg blijven.",
  },
  {
    icon: "floor",
    title: "Plattegrond",
    text: "Upload de PDF of afbeelding van je makelaar. Alles gebeurt in je eigen browser.",
    auto: "Kamers opgemeten langs de wanden, schaal uit de maatlijnen, ramen en deuren.",
    you: "Je controleert elke kamer en kiest welke meetellen.",
  },
  {
    icon: "phone",
    title: "Ramen",
    text: "Scan je ramen met je telefoon: richt op de hoeken en houd even stil. Geen papier, geen rolmaat.",
    auto: "Maten in millimeters met foutmarge, en of een scan opnieuw moet.",
    you: "Je kiest product en montage en bevestigt de maten.",
  },
  {
    icon: "list",
    title: "Bestellijst",
    text: `Gratis je vloer en verf. Voor ${PRICE.label} ${PRICE.period} alles in één rapport.`,
    auto: "Hoeveelheden met snijverlies, pakken en marges, met bron per getal.",
    you: "Je kiest wat je koopt; het rapport zegt wat nog ontbreekt.",
  },
];

export default function Home() {
  const floor = exampleFloor();
  const included = EXAMPLE_ROOMS.filter((r) => r.included);
  const url = siteUrl();
  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: BRAND.name,
            url,
            description: BRAND.description,
            applicationCategory: "UtilitiesApplication",
            operatingSystem: "Web",
            inLanguage: BRAND.language,
            browserRequirements: "Een moderne browser. Ramen scannen vraagt een Android-telefoon met Chrome en AR-ondersteuning.",
            offers: [
              { "@type": "Offer", name: "Gratis basis", price: "0", priceCurrency: "EUR" },
              { "@type": "Offer", name: "Compleet woningrapport", price: (PRICE.amountCents / 100).toFixed(2), priceCurrency: "EUR" },
            ],
            publisher: { "@id": `${url}/#organisatie` },
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          },
        ]}
      />

      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">Jouw woning. Eén duidelijk overzicht.</p>
            <h1>
              Eerst <span className="accent">{BRAND.name}</span>.
            </h1>
            <p className="hero-lead">
              Bereken je materialen, breng je ramen in kaart en maak één overzichtelijke bestellijst voor jouw woning.
            </p>
            <HeroStart />
          </div>

          <figure className="product-visual" aria-label="Productvoorbeeld met een fictieve woning">
            <span className="badge badge-demo example-tag">Voorbeelddata · fictieve woning</span>
            <div className="product-plan">
              <PlanIllustration />
            </div>
            <div className="product-card" aria-hidden="true">
              <div className="row" style={{ justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <h3>Bestellijst</h3>
                <LogoMark className="logo-mark" />
              </div>
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
                    <td>Laminaat, pakken à {formatM2(EXAMPLE_PACK_M2, 3)}</td>
                    <td>{formatCount(floor.packs ?? 0)}</td>
                  </tr>
                  <tr>
                    <td>Ramen</td>
                    <td>
                      {EXAMPLE_WINDOWS[0]!.code}–{EXAMPLE_WINDOWS.at(-1)!.code}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="tiny muted" style={{ margin: "8px 0 0" }}>
                Voorbeelddata, berekend met dezelfde rekenregels als de app.
              </p>
            </div>
            <figcaption className="visually-hidden">
              Voorbeeldweergave: {included.length} geselecteerde ruimtes, samen {formatM2(floor.selectedNetM2)}, met{" "}
              {formatPercent(EXAMPLE_WASTE)} snijverlies {formatM2(floor.requiredM2 ?? 0)}.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="section" id="hoe-het-werkt">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Zo werkt het</p>
            <h2>Van jouw woning naar een duidelijke bestellijst</h2>
            <p className="muted">
              {BRAND.rule} Wij meten wat we kunnen uit je tekening en je telefoon. Jij ziet bij elk getal wat automatisch herkend is, wat
              gemeten is en wat je nog moet bevestigen. Pas dan rekenen we.
            </p>
          </div>
          <ol className="steps">
            {STEPS.map((s) => (
              <li key={s.title}>
                <span className="step-num">
                  <Icon name={s.icon} />
                </span>
                <h3>{s.title}</h3>
                <p className="small muted">{s.text}</p>
                <dl className="step-split">
                  <dt>Automatisch</dt>
                  <dd>{s.auto}</dd>
                  <dt>Jij</dt>
                  <dd>{s.you}</dd>
                </dl>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section-alt" id="vertrouwen">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Je ziet waar elk getal vandaan komt</p>
            <h2>Gemeten, berekend of nog te controleren: het staat erbij</h2>
            <p className="muted">
              Een plattegrond van bovenaf vertelt niet hoe hoog je ramen zijn, en een adres onthult geen kamers. Daarom krijgt elk getal een
              label, vullen we nooit zelf iets in en zeggen we het als iets nog gemeten moet worden.
            </p>
          </div>
          <div className="status-legend">
            {(["auto", "measured", "confirmed", "derived", "check", "missing"] as Status[]).map((s) => (
              <div key={s} className="card-flat stack-sm">
                <StatusBadge status={s} />
                <span className="small muted">{STATUS_META[s].description}</span>
              </div>
            ))}
          </div>
          <p className="small" style={{ marginTop: 20 }}>
            Hoe we meten, rekenen en afronden, met bronnen: <Link href="/hoe-we-meten">zo werkt de berekening</Link>.
          </p>
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
            </ul>
          </div>
          <InteractiveDemo />
        </div>
      </section>

      <section className="section section-dark" id="scantag">
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

      <section className="section" id="prijs">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Prijs</p>
            <h2>
              Start gratis. Complete bestellijst {PRICE.label} {PRICE.period}.
            </h2>
            <p className="muted">Geen abonnement, geen account, geen adviesgesprek. Je gratis resultaat blijft gewoon zichtbaar.</p>
          </div>
          <PricingBlock />
        </div>
      </section>

      <section className="section section-alt" id="rapport">
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
              <li>Per raam (R01, R02 …) de maten in millimeters, foutmarge, bron en bestelstatus</li>
              <li>Printvriendelijk, met paginanummers, en ook als CSV-bestellijst</li>
            </ul>
          </div>
          <div className="report-mock" aria-label="Voorbeeldweergave van het PDF-rapport, met voorbeelddata" role="img">
            <div className="paper" aria-hidden="true">
              <div className="paper-head">
                <span className="tiny muted">Meet- en bestelrapport · voorbeelddata</span>
                <LogoMark />
              </div>
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
              <div className="paper-head">
                <span className="tiny muted">Raamregister · voorbeelddata</span>
                <LogoMark />
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Raam</th>
                    <th>Product</th>
                    <th className="r">Opening (mm)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>R01</td>
                    <td>Plissé, in de dag</td>
                    <td className="r">1198 × 1496</td>
                  </tr>
                  <tr>
                    <td>R02</td>
                    <td>Rolgordijn</td>
                    <td className="r">nog meten</td>
                  </tr>
                  <tr>
                    <td>R03</td>
                    <td>Gordijn, wand</td>
                    <td className="r">rail 2200</td>
                  </tr>
                </tbody>
              </table>
              <span className="tiny muted">Bestelmaat alleen met de gecontroleerde regel van je leverancier.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="gidsen">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Gidsen</p>
            <h2>Zelf uitrekenen hoe het zit</h2>
            <p className="muted">Hoe je vloer, verf, plinten en raamdecoratie meet en berekent, stap voor stap en met rekenvoorbeelden.</p>
          </div>
          <div className="guide-grid">
            {GUIDE_INDEX.map((g) => (
              <Link key={g.slug} href={`/gidsen/${g.slug}`} className="guide-link">
                {g.nav}
                <Icon name="arrow-right" />
              </Link>
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
          <h2>{BRAND.tagline}</h2>
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
          <strong>Start gratis</strong> · rapport {PRICE.label}
        </span>
        <Link href="/project/nieuw" className="btn btn-primary">
          Starten
        </Link>
      </div>
    </>
  );
}
