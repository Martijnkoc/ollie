import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMetadata } from "@/components/seo/metadata";
import { AR_MEASURE } from "@/config/scantag";
import { BRAND, MEASURE_DEVIATION_WARNING_MM, siteUrl, SOURCES } from "@/config/site";
import { PATTERNS } from "@/lib/materials/patterns";

export const metadata: Metadata = pageMetadata({
  title: "Hoe we meten en rekenen",
  description: `Waar de getallen van ${BRAND.name} vandaan komen: bronnen, rekenregels, afronding, foutmarges en wat we bewust niet doen. Met de status van elke methode.`,
  path: "/hoe-we-meten",
  type: "article",
});

const UPDATED = "2026-10-20";

export default function MethodPage() {
  const url = siteUrl();
  return (
    <article className="container guide">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Hoe we meten en rekenen",
          inLanguage: BRAND.language,
          dateModified: UPDATED,
          mainEntityOfPage: `${url}/hoe-we-meten`,
          author: { "@id": `${url}/#organisatie` },
          publisher: { "@id": `${url}/#organisatie` },
        }}
      />
      <header className="guide-head">
        <p className="eyebrow">Methode</p>
        <h1>Hoe we meten en rekenen</h1>
        <p className="hero-lead">
          Elk getal in {BRAND.name} heeft een bron en een status. Hier staat per onderdeel hoe we eraan komen, hoe we afronden en wat we
          bewust niet doen. Wat nog niet is aangetoond, zeggen we ook.
        </p>
      </header>
      <div className="guide-main" style={{ maxWidth: 820 }}>
        <section>
          <h2>Labels bij elk getal</h2>
          <ul className="ticks">
            <li>
              <strong>Automatisch herkend</strong>: uit je tekening gehaald, nog niet door jou nagekeken.
            </li>
            <li>
              <strong>Gemeten</strong>: met de AR-tracking van je telefoon gemeten (ScanTag), met foutmarge.
            </li>
            <li>
              <strong>Door jou bevestigd</strong>: je hebt de waarde nagekeken.
            </li>
            <li>
              <strong>Berekend</strong>: met een vaste formule uit bevestigde invoer.
            </li>
            <li>
              <strong>Nog controleren</strong> of <strong>nog meten</strong>: er ontbreekt iets; we vullen niets zelf in.
            </li>
          </ul>
        </section>

        <section>
          <h2>Adres en woninggegevens</h2>
          <p>
            Adres, bouwjaar en gebruiksoppervlakte komen uit de {SOURCES.bag}. De gebruiksoppervlakte is een registratie van de hele woning,
            gebaseerd op NEN 2580, in hele vierkante meters. We tonen hem apart en gebruiken hem nergens als kamermaat of om vloer te
            berekenen. Een adres zegt niets over de indeling van je woning.
          </p>
        </section>

        <section>
          <h2>Plattegrond</h2>
          <p>
            Je plattegrond wordt in je eigen browser gelezen: de tekst uit de PDF, of tekstherkenning (OCR) op je apparaat bij een
            afbeelding. Kamers meten we langs de getekende wanden; de schaal halen we uit de maatlijnen op de tekening, en die moeten
            onderling kloppen (horizontaal en verticaal), anders gebruiken we ze niet. Zonder bruikbare schaal kalibreer je zelf met één
            bekende maat. Er gaat geen plattegrond naar onze server of naar een AI-, vision- of OCR-dienst.
          </p>
        </section>

        <section>
          <h2>Rekenregels</h2>
          <p>
            We rekenen intern in millimeters en vierkante millimeters en ronden pas af bij het tonen. Hoeveelheden die je koopt per stuk,
            pak, doos of blik ronden we naar boven af.
          </p>
          <ul className="ticks">
            <li>
              Vloer: netto m² × (1 + snijverlies). Richtwaarden per legpatroon, die je zelf aanpast:{" "}
              {PATTERNS.filter((p) => p.guidePercent !== null)
                .map((p) => `${p.label.toLowerCase()} ${p.guidePercent} %`)
                .join(", ")}
              . Zie <Link href="/gidsen/laminaat-berekenen">laminaat berekenen</Link>.
            </li>
            <li>
              Plinten: omtrek − wanden zonder plint − bevestigde deuren, + rondom obstakels, × (1 + marge). Zie{" "}
              <Link href="/gidsen/plinten-berekenen">plinten berekenen</Link>.
            </li>
            <li>
              Verf: (omtrek × plafondhoogte − openingen) × lagen / dekking. Zie <Link href="/gidsen/verf-berekenen">verf berekenen</Link>.
            </li>
            <li>
              Een aanname (snijverlies, dekking, plafondhoogte) staat altijd als aanname in beeld en in het rapport, tot je je eigen waarde
              invult.
            </li>
          </ul>
        </section>

        <section>
          <h2>Ramen: ScanTag</h2>
          <p>
            ScanTag meet met de AR-tracking van je telefoon (WebXR met hit-test, in Chrome op Android). Je richt het vizier op elke hoek;
            per punt nemen we {AR_MEASURE.framesPerPoint} beelden en bewaren het gemiddelde, de spreiding en de afstand. Breedte en hoogte
            komen uit het best passende vlak door de vier hoeken, de diepte langs de normaal van de muur. Er wordt geen foto gemaakt.
          </p>
          <p>
            De foutmarge per maat is een aanname tot de fysieke validatie: per punt de eigen spreiding plus {AR_MEASURE.baseSigmaMm} mm +{" "}
            {AR_MEASURE.sigmaPerMetreMm} mm per meter afstand, en {AR_MEASURE.scalePercent} % van de lengte voor de schaal van de tracking.
            Elke ScanTag-maat krijgt één van drie statussen: geaccepteerd voor bestellen (alleen met kwaliteitscriteria die tegen een
            gekalibreerde meting zijn gevalideerd — dat is nog voor geen enkel product gebeurd), opnieuw scannen, of niet geschikt om op te
            bestellen. Zonder AR-tracking (zoals Safari op een iPhone) meten we niets in millimeters.
          </p>
          <p>
            Meetpunten van één raam vergelijken we met elkaar; bij een verschil boven {MEASURE_DEVIATION_WARNING_MM} mm (of de foutmarge van
            de scan) vragen we je opnieuw te meten. We middelen niets weg.
          </p>
        </section>

        <section>
          <h2>Bestelmaten voor raamdecoratie</h2>
          <p>
            Er bestaat geen aftrek die voor alle producten geldt. Een bestelmaat rekenen we alleen uit met de meetregel van de leverancier
            van jouw product, als die regel door een mens tegen de volledige bron is gecontroleerd en niet ouder is dan een jaar, en als je
            maten bevestigd of geaccepteerd zijn. Anders staat er geen getal, maar de reden. De regels die we nu hebben (Tuiss) zijn een
            concept: ze zijn samengevat uit de meetgids van Tuiss en nog niet volledig gecontroleerd, dus geven ze nog geen bestelmaat.
            Bestelvelden zijn hele millimeters; zonder afrondingsregel uit de bron ronden we naar beneden af.
          </p>
        </section>

        <section>
          <h2>Wat we bewust niet doen</h2>
          <ul className="ticks">
            <li className="no">Geen generatieve AI als bron van millimeters of oppervlaktes.</li>
            <li className="no">Geen kamermaten uit de BAG of uit een adres.</li>
            <li className="no">Geen raamhoogtes uit een plattegrond van bovenaf.</li>
            <li className="no">Geen nauwkeurigheidspercentage zonder gedocumenteerde validatie.</li>
            <li className="no">Geen papieren meetkaarten of A4-vellen: de scan werkt zonder voorbereiding.</li>
          </ul>
        </section>

        <section>
          <h2>Bronnen</h2>
          <ul className="sources small">
            <li>
              <a href="https://www.kadaster.nl/zakelijk/registraties/basisregistraties/bag" rel="noopener">
                Kadaster, Basisregistratie Adressen en Gebouwen (BAG)
              </a>
            </li>
            <li>
              <a href="https://www.pdok.nl" rel="noopener">
                PDOK (Publieke Dienstverlening Op de Kaart)
              </a>
            </li>
            <li>
              <a href="https://repository.officiele-overheidspublicaties.nl/externebijlagen/exb-2018-72882/currentitem" rel="noopener">
                Waarderingskamer, Meetinstructie gebruiksoppervlakte woningen (op basis van NEN 2580)
              </a>
            </li>
            <li>
              <a href="https://www.raamdecoratievantuiss.nl/meten-voor-raamdecoratie" rel="noopener">
                Tuiss, Meten voor raamdecoratie
              </a>
            </li>
            <li>
              <a href="https://www.w3.org/TR/webxr-hit-test-1/" rel="noopener">
                W3C, WebXR Hit Test Module
              </a>
            </li>
          </ul>
          <p className="tiny muted">Bijgewerkt op 20 oktober 2026.</p>
        </section>
      </div>
    </article>
  );
}
