import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Over Voetbalradar",
  description: "Hoe Voetbalradar werkt: databron, actualiteit, AI-analyses en waar we bewust níet aan doen.",
  alternates: { canonical: "/over" },
};

export default function AboutPage() {
  return (
    <div className="container page">
      <div className="prose">
        <h1 style={{ color: "var(--text)" }}>Over Voetbalradar</h1>
        <p>Voetbalradar is een snel overzicht van livescores, uitslagen, programma&apos;s en standen, met korte analyses die eerlijk zijn over wat ze wel en niet weten.</p>
        <h2>Waar de gegevens vandaan komen</h2>
        <p>
          Alle wedstrijdgegevens komen van een gelicentieerde voetbaldatabron. Onze servers halen ze automatisch op en bewaren ze in onze eigen database; je browser praat
          nooit rechtstreeks met de databron. Bij elke livewedstrijd zie je wanneer de databron de stand voor het laatst heeft bevestigd.
        </p>
        <ul>
          <li>Een statistiek die de databron niet levert, tonen we als &ldquo;niet beschikbaar&rdquo;, nooit als nul.</li>
          <li>Uitgestelde, geannuleerde en gestaakte wedstrijden krijgen hun eigen status en nooit een gewone eindstand.</li>
          <li>Standen nemen we over zoals de databron ze levert; we rekenen ze niet zelf uit.</li>
          <li>We tonen een competitie pas als ondersteund wanneer de databron hem binnen ons abonnement daadwerkelijk levert.</li>
        </ul>
        <h2>AI-analyses</h2>
        <p>
          Voorbeschouwingen en nabeschouwingen worden vooraf gegenereerd door een taalmodel. Het model krijgt alleen de gegevens uit onze database: de stand, recente
          uitslagen, gebeurtenissen en statistieken. Elk punt is gelabeld als feit, statistiek of interpretatie. Een analyse met een getal dat niet in de gegevens
          voorkomt, of met kansen en voorspellingen als zekerheid, wordt automatisch afgekeurd en niet getoond. Veranderen de gegevens, dan verdwijnt de oude analyse.
        </p>
        <p>Interpretaties blijven interpretaties. Gebruik ze niet als basis voor weddenschappen; daar is Voetbalradar niet voor gemaakt.</p>
        <h2>Logo&apos;s en namen</h2>
        <p>
          Clubnamen en competitienamen gebruiken we om wedstrijden te beschrijven. Clublogo&apos;s zijn merken van de clubs; zolang de rechten daarvoor niet geregeld zijn,
          tonen we neutrale initialen. Voetbalradar is niet verbonden aan clubs, competities of andere livescorediensten.
        </p>
        <p>
          <Link href="/status">Bekijk de synchronisatiestatus</Link> · <Link href="/privacy">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
