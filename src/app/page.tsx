import Link from "next/link";
import { HeroIllustration } from "@/components/HeroIllustration";
import { viewer } from "@/lib/access";
import { DATE_MINUTES, MATCH_ORIGINS, MEMBERSHIP } from "@/lib/config";

const apps = MATCH_ORIGINS.slice(0, -1).join(", ");

export default async function Home(props: PageProps<"/">) {
  const v = await viewer();
  const query = await props.searchParams;
  return (
    <>
      {query.account === "verwijderd" && (
        <div className="container" style={{ paddingTop: 24 }}>
          <p className="notice good" role="status">
            Je account en gegevens zijn verwijderd. Bedankt dat je er was.
          </p>
        </div>
      )}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">Videodates van {DATE_MINUTES} minuten</p>
            <h1>
              Eerst een klik.
              <span className="serif-accent">Dan een date.</span>
            </h1>
            <p className="lead">
              Moe van steeds dezelfde gesprekken op verschillende apps? Zie en spreek elkaar eerst twintig minuten op video. Daarna kies je
              rustig, en privé, of je echt wilt afspreken.
            </p>
            <div className="row hero-actions">
              <Link className="btn large" href={v?.community ? "/uitnodigen" : "/lidmaatschap"}>
                Neem je match mee
              </Link>
              <Link className="btn large secondary" href="#community">
                Bekijk de community
              </Link>
            </div>
          </div>
          <HeroIllustration />
        </div>
      </section>

      <section className="container" aria-labelledby="ingangen">
        <h2 id="ingangen" className="visually-hidden">
          Twee manieren om te beginnen
        </h2>
        <div className="doors">
          <Link href={v?.community ? "/uitnodigen" : "/lidmaatschap"} className="door primary">
            <h3>Ik heb al een match</h3>
            <p>
              Matchte je via {apps} of ergens anders? Stuur een uitnodigingslink. Wij regelen een besloten videodate van twintig minuten. Je
              match betaalt niets en hoeft vooraf geen app te downloaden.
            </p>
            <span className="go">Match uitnodigen →</span>
          </Link>
          <Link href={v?.community ? "/cafe/lounge" : "/lidmaatschap"} className="door">
            <h3>Ik wil iemand ontmoeten</h3>
            <p>Word lid van Cafe. Praat in de lounge of aan een tafel en nodig iemand uit voor zo&apos;n videodate.</p>
            <span className="go">Naar Cafe →</span>
          </Link>
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          Cafe is niet verbonden aan {apps}. Je deelt zelf een uitnodiging via de app waarop je matchte.
        </p>
      </section>

      <section className="section container stack-lg" id="zo-werkt-het">
        <div>
          <p className="eyebrow">Zo werkt het</p>
          <h2>Een beter geïnformeerde beslissing over je volgende date</h2>
        </div>
        <ol className="steps">
          <li>
            <strong>Uitnodigen</strong>
            <span className="muted">
              Kies een tijdstip en deel de link. Je match bevestigt met een eigen inlog; jij ziet wie er heeft geaccepteerd.
            </span>
          </li>
          <li>
            <strong>Twintig minuten</strong>
            <span className="muted">
              Test in de lobby je camera. De twintig minuten beginnen pas als jullie er allebei zijn, en de ruimte sluit daarna vanzelf.
            </span>
          </li>
          <li>
            <strong>Privé kiezen</strong>
            <span className="muted">
              Drie korte vragen, alleen voor jou. Alleen als jullie allebei verder willen, opent er een vervolg.
            </span>
          </li>
        </ol>
        <p className="muted" style={{ maxWidth: "40em" }}>
          Een vriendelijke &lsquo;nee&rsquo; na twintig minuten is ook een goed resultaat: je weet het, zonder dat je er een hele avond voor
          vrijmaakte.
        </p>
      </section>

      <section className="section container" id="community">
        <div className="grid-2" style={{ alignItems: "center" }}>
          <div className="stack">
            <p className="eyebrow">De community</p>
            <h2>Cafe: eerst wat sfeer proeven</h2>
            <ul className="checks">
              <li>
                <strong>De lounge</strong> — het gezamenlijke gesprek, laagdrempelig aanschuiven.
              </li>
              <li>
                <strong>Tafels</strong> — kleinere gesprekken rond regio en interesses.
              </li>
              <li>
                <strong>Privé</strong> — begint met een verzoek dat de ander accepteert.
              </li>
              <li>
                <strong>Even samen zitten?</strong> — plan vanuit het gesprek een videodate. Pas als jullie allebei bevestigen, staat de
                afspraak.
              </li>
            </ul>
          </div>
          <div className="card stack" aria-label="Voorbeeld van een gesprek aan een tafel">
            <span className="badge demo">Voorbeeld · geen echte leden</span>
            <div className="msg">
              <div className="meta">
                <strong>Noor</strong>
              </div>
              <div className="bubble">Iemand een tip voor een rustige wandeling rond Utrecht?</div>
            </div>
            <div className="msg mine">
              <div className="meta">
                <strong>Jij</strong>
              </div>
              <div className="bubble">Amelisweerd! Daar kun je ook prima koffie halen.</div>
            </div>
            <div className="msg">
              <div className="meta">
                <strong>Noor</strong>
              </div>
              <div className="bubble">Klinkt goed. Even samen zitten om het erover te hebben?</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section container">
        <div className="grid-2">
          <div className="card soft stack">
            <h2>Jij houdt de regie</h2>
            <ul className="checks">
              <li>Je contactgegevens blijven verborgen. Delen doe je zelf, per gegeven.</li>
              <li>Je feedback is vertrouwelijk. De ander ziet je antwoorden niet.</li>
              <li>Een gesprek vroeg beëindigen kan altijd.</li>
              <li>Blokkeren en melden kan altijd, ook tijdens het gesprek.</li>
              <li>We zetten opnemen en transcriberen niet aan voor videodates.</li>
            </ul>
          </div>
          <div className="card stack" id="lidmaatschap">
            <p className="eyebrow">Lidmaatschap</p>
            <p className="price">
              {MEMBERSHIP.priceLabel} <small>per {MEMBERSHIP.period}</small>
            </p>
            <ul className="checks">
              <li>De community: lounge, tafels en privégesprekken</li>
              <li>
                {MEMBERSHIP.datesPerPeriod} videodates van {DATE_MINUTES} minuten per {MEMBERSHIP.period}
              </li>
              <li>Je uitgenodigde match doet gratis mee aan die videodate</li>
              <li>Maandelijks opzegbaar</li>
            </ul>
            <p className="muted small">{MEMBERSHIP.priceNote}</p>
            <Link className="btn" href="/lidmaatschap">
              Bekijk het lidmaatschap
            </Link>
          </div>
        </div>
      </section>

      <section className="section container narrow faq" aria-labelledby="faq">
        <h2 id="faq">Veelgestelde vragen</h2>
        <details>
          <summary>Moet mijn match betalen of een app installeren?</summary>
          <p>
            Nee. Je match logt in met een e-mailcode, bevestigt het moment en doet gratis mee aan die ene videodate, in de browser. Voor de
            community is een eigen lidmaatschap nodig.
          </p>
        </details>
        <details>
          <summary>Wanneer beginnen de twintig minuten?</summary>
          <p>
            Pas als jullie er allebei zijn. Daarna liggen begin en eind vast op onze server: herladen of opnieuw verbinden geeft geen extra
            tijd. Twee minuten voor het einde krijg je een seintje.
          </p>
        </details>
        <details>
          <summary>Wat als de ander niet komt?</summary>
          <p>
            Je wacht maximaal een kwartier na de afgesproken tijd. Daarna sluit de ruimte en telt de videodate niet mee voor je maandtegoed.
          </p>
        </details>
        <details>
          <summary>Wat ziet de ander van mijn feedback?</summary>
          <p>
            Niets van je antwoorden. De ander hoort alleen iets als jullie allebei verder willen. Geen antwoord geven betekent nooit
            &lsquo;ja&rsquo;.
          </p>
        </details>
        <details>
          <summary>Is Cafe verbonden aan Tinder, Bumble of andere apps?</summary>
          <p>Nee. Cafe werkt los van die apps. Je deelt zelf een uitnodigingslink in het gesprek waar jullie matchten.</p>
        </details>
        <details>
          <summary>Hoe zeg ik op?</summary>
          <p>Via je lidmaatschapspagina, op elk moment. Je houdt toegang tot het einde van de betaalde periode.</p>
        </details>
      </section>

      <section className="section container">
        <div className="card lime stack" style={{ textAlign: "center" }}>
          <h2>
            Eerst een klik. <span className="serif-accent">Dan een date.</span>
          </h2>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link className="btn large" href={v ? "/lidmaatschap" : "/inloggen?next=/lidmaatschap"}>
              Word lid
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
