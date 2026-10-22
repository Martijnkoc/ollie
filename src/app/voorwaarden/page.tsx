import type { Metadata } from "next";
import Link from "next/link";
import { AUTO_COMPLETE_DAYS, OVERDUE_GRACE_DAYS, PLATFORM_FEE_BPS, TERMS_VERSION } from "@/lib/config";

export const metadata: Metadata = { title: "Voorwaarden" };

export default function Terms() {
  return (
    <div className="container narrow page legal">
      <p className="eyebrow">Voorwaarden · versie {TERMS_VERSION}</p>
      <h1>Gebruiksvoorwaarden</h1>
      <p className="notice warn">
        Concept. Deze tekst beschrijft hoe het platform technisch werkt en moet vóór de lancering juridisch worden getoetst en aangevuld
        (onder meer bedrijfsgegevens, toepasselijk recht en aansprakelijkheid).
      </p>
      <h2>1. Wat Sell Yourself is</h2>
      <p>
        Sell Yourself is een platform waarop makers, creators, freelancers en vakmensen hun werk tonen en diensten aanbieden, en waarop
        anderen die diensten kunnen kopen. De overeenkomst over een opdracht sluit je met de maker. Sell Yourself faciliteert het contact,
        de afspraak en de betaling.
      </p>
      <h2>2. Account</h2>
      <ul>
        <li>Je logt in met een e-mailcode. Eén account kan kopen én verkopen.</li>
        <li>Je geeft juiste gegevens op. Verkoop je als ondernemer, dan geef je dat aan met je KvK-nummer.</li>
        <li>Je bent minimaal 18 jaar, of handelt met toestemming van een ouder of voogd waar de wet dat toestaat.</li>
      </ul>
      <h2>3. Een opdracht afspreken</h2>
      <ul>
        <li>
          Bij een dienst met vaste prijs komt de afspraak tot stand als je bestelt via &lsquo;Bestellen met betaalverplichting&rsquo;.
        </li>
        <li>Bij maatwerk komt de afspraak tot stand als je een offerte accepteert. Tot die tijd is alles vrijblijvend.</li>
        <li>De opdracht start pas als de betaling is bevestigd.</li>
      </ul>
      <h2>4. Betalen, kosten en uitbetalen</h2>
      <ul>
        <li>Je betaalt via Sell Yourself met onze betaalpartner Stripe. Kopers betalen geen servicekosten.</li>
        <li>Makers betalen {PLATFORM_FEE_BPS / 100}% platformkosten over de afgesproken prijs, ingehouden bij de uitbetaling.</li>
        <li>
          Het bedrag gaat naar de maker als de koper de oplevering goedkeurt, of {AUTO_COMPLETE_DAYS} dagen na de oplevering als de koper
          niet reageert en geen klacht indient.
        </li>
      </ul>
      <h2>5. Annuleren en terugbetalen</h2>
      <ul>
        <li>Vóór betaling kunnen beide partijen stoppen.</li>
        <li>Na betaling kan de maker annuleren; de koper krijgt het volledige bedrag terug.</li>
        <li>
          Als de levertijd {OVERDUE_GRACE_DAYS} dagen is verstreken zonder oplevering, kan de koper annuleren met volledige terugbetaling.
        </li>
        <li>Wettelijke rechten van consumenten tegenover zakelijke verkopers blijven onverminderd gelden.</li>
      </ul>
      <h2>6. Klachten</h2>
      <p>
        Bij een klacht over een opdracht beslist een moderator na het bekijken van de opdracht, de tijdlijn en de berichten. We leggen elk
        besluit vast met een toelichting die beide partijen zien. Je kunt daarnaast altijd naar de rechter of een geschillencommissie.
      </p>
      <h2 id="richtlijnen">7. Richtlijnen voor inhoud en gedrag</h2>
      <ul>
        <li>Toon alleen eigen werk, en alleen beelden van herkenbare personen met hun toestemming.</li>
        <li>Geen seksueel getinte diensten of inhoud, geen illegaal aanbod, geen misleiding.</li>
        <li>Spreek niet af om buiten het platform te betalen.</li>
        <li>Wees respectvol. Intimidatie, discriminatie en spam zijn niet toegestaan.</li>
        <li>Reviews moeten gaan over een echte, afgeronde opdracht.</li>
      </ul>
      <h2>8. Moderatie</h2>
      <p>
        Iedereen kan inhoud, berichten en gebruikers melden. Een moderator beoordeelt elke melding; niets wordt automatisch gesanctioneerd.
        Bij een maatregel (inhoud verbergen, account beperken) krijg je de reden te zien en kun je bezwaar maken.
      </p>
      <p>
        Zie ook de <Link href="/privacy">privacyverklaring</Link> en <Link href="/hoe-het-werkt">hoe het werkt</Link>.
      </p>
    </div>
  );
}
