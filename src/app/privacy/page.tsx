import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Welke gegevens Voetbalradar wel en niet verwerkt.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="container page">
      <div className="prose">
        <h1 style={{ color: "var(--text)" }}>Privacy</h1>
        <p className="small dim">Concept, op te stellen met juridisch advies vóór advertenties of accounts worden toegevoegd.</p>
        <h2>Wat we niet doen</h2>
        <ul>
          <li>Geen accounts, geen e-mailadressen, geen inlog.</li>
          <li>Geen trackingcookies, geen advertentiescripts en geen analysediensten van derden.</li>
          <li>Je favorieten verlaten je browser niet als lijst; ze staan in de lokale opslag (localStorage) van je browser.</li>
        </ul>
        <h2>Wat technisch wel gebeurt</h2>
        <ul>
          <li>
            Onze hostingprovider verwerkt, zoals elke webserver, technische gegevens zoals IP-adres en opgevraagde pagina in serverlogs,
            voor beveiliging en storingsonderzoek.
          </li>
          <li>
            Om de wedstrijden van je favorieten te tonen, vraagt je browser die op met de nummers van de clubs en competities, zonder te
            weten wie je bent.
          </li>
        </ul>
        <h2>Later</h2>
        <p>
          Als we advertenties of accounts toevoegen, passen we deze pagina eerst aan en vragen we toestemming waar de AVG en de cookieregels
          dat vereisen. Zonder die toestemming worden geen advertentie- of trackingscripts geladen.
        </p>
      </div>
    </div>
  );
}
