import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="container narrow page stack-lg">
      <div>
        <h1>Privacy</h1>
        <p className="lead">Wat Cafe van je bewaart, waarom, en hoe lang. Kort en zonder kleine lettertjes.</p>
        <p className="notice warn small">
          Concept. Deze tekst beschrijft hoe de software werkt. Een juridische toets van privacy, leeftijd, betaling en video vindt plaats
          vóór Cafe voor echte mensen opengaat.
        </p>
      </div>
      <section className="stack">
        <h2>Wat we bewaren</h2>
        <ul className="checks">
          <li>
            <strong>Account:</strong> je e-mailadres, om in te loggen met een code. Geen wachtwoord.
          </li>
          <li>
            <strong>Profiel (alleen leden):</strong> voornaam of alias, geboortedatum (voor de 18+-controle), regio, wat je zoekt, optionele
            interesses en introductie. Je kiest zelf of leeftijd en regio zichtbaar zijn.
          </li>
          <li>
            <strong>Lidmaatschap:</strong> de status van je abonnement zoals Stripe die doorgeeft. Betaalgegevens zelf staan bij Stripe,
            niet bij ons.
          </li>
          <li>
            <strong>Berichten:</strong> wat je in de lounge, aan tafels en in privégesprekken schrijft.
          </li>
          <li>
            <strong>Videodates:</strong> tijdstip, deelnemers, begin en eind. Geen beeld of geluid.
          </li>
          <li>
            <strong>Feedback:</strong> je drie antwoorden na een videodate. Alleen jij kunt ze zien; geautoriseerde moderatoren zien alleen
            totalen.
          </li>
          <li>
            <strong>Gedeelde contactgegevens:</strong> alleen wat jij per gegeven deelt, met je toestemming en het moment waarop.
          </li>
        </ul>
      </section>
      <section className="stack">
        <h2>Wat we niet doen</h2>
        <ul className="checks">
          <li>We zetten opnemen en transcriberen niet aan voor videodates. Beeld en geluid lopen via onze videodienst (Daily).</li>
          <li>We tonen je e-mailadres, achternaam of telefoonnummer niet aan anderen, ook niet aan de videodienst.</li>
          <li>We laten nooit zien wie &lsquo;nee&rsquo; zei. Geen antwoord geven telt nooit als &lsquo;ja&rsquo;.</li>
          <li>We koppelen niets aan andere datingapps en lezen daar niets uit.</li>
          <li>Geen openbare profielen of beoordelingen van mensen.</li>
        </ul>
      </section>
      <section className="stack">
        <h2>Hoe lang</h2>
        <ul className="checks">
          <li>Inlogcodes: maximaal een dag. Sessies: maximaal dertig dagen.</li>
          <li>Feedback en gedeelde contactgegevens: twaalf maanden, daarna verwijderd.</li>
          <li>Meldingen en moderatiebesluiten: zolang nodig voor de veiligheid van de community.</li>
        </ul>
      </section>
      <section className="stack">
        <h2>Verwijderen</h2>
        <p>
          Via je accountpagina verwijder je je account. We verwijderen dan je account, profiel, berichten, feedback en gedeelde
          contactgegevens en stoppen je abonnement. Geplande videodates worden afgezegd. Meldingen die jij over anderen deed, blijven zonder
          jouw naam bewaard. Wat je eerder zelf met iemand deelde, kunnen we niet bij die persoon terughalen.
        </p>
      </section>
    </div>
  );
}
