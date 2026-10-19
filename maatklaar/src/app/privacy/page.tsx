import type { Metadata } from "next";
import { CompanyField, DraftBanner } from "@/components/Legal";
import { BRAND, LIMITS, SOURCES } from "@/config/site";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="container section-tight legal">
      <DraftBanner
        checklist={[
          "Naam, adres, KvK-nummer en contactgegevens van de verwerkingsverantwoordelijke invullen",
          "Verwerkersovereenkomsten met hosting (bijv. Vercel), database (bijv. Supabase) en Mollie vastleggen",
          "Bewaartermijn van ordermetadata vaststellen (fiscale bewaarplicht toetsen)",
          "Controleren of hosting buiten de EU plaatsvindt en zo ja op welke grondslag",
          "Bepalen of er een verwerkingsregister en DPIA nodig zijn",
        ]}
      />
      <h1>Privacy</h1>
      <p className="muted">
        {BRAND.name} is zo gebouwd dat zo weinig mogelijk gegevens onze kant op komen. Hieronder staat precies wat er waar gebeurt.
      </p>

      <h2>Wat op je eigen apparaat blijft</h2>
      <ul>
        <li>
          <strong>Je plattegrond.</strong> Het bestand wordt in je browser gelezen (PDF-tekst en tekstherkenning op je apparaat). Het gaat niet naar onze server en niet naar een
          AI-, vision- of OCR-dienst.
        </li>
        <li>
          <strong>Je project:</strong> kamers, maten, ramen en instellingen staan in de opslag van je browser (IndexedDB). Als je dat kiest, staat daar ook je bestand, zodat je
          na verversen of betalen verder kunt.
        </li>
        <li>
          <strong>Wissen:</strong> je kunt je bestand of je hele project op elk moment verwijderen. Projecten zonder wijzigingen worden na {LIMITS.projectExpiryDays} dagen
          automatisch gewist.
        </li>
        <li>Het PDF-rapport en de CSV worden op je apparaat gemaakt.</li>
      </ul>

      <h2>Wat naar een server gaat</h2>
      <ul>
        <li>
          <strong>Adres zoeken.</strong> Wat je in het adresveld typt, en het adres dat je kiest, gaan via onze server naar de {SOURCES.locatieserver} en de BAG van het Kadaster
          (PDOK). Wij slaan dit niet op en loggen het niet. Zie de voorwaarden van PDOK voor wat het Kadaster bewaart.
        </li>
        <li>
          <strong>Betalen.</strong> Als je het volledige rapport koopt, maken we een order aan met alleen: een ordernummer, een willekeurige projectreferentie, het bedrag, de
          betaalstatus en tijdstippen. Geen naam, e-mail, adres of kamergegevens. De betaling zelf verloopt via Mollie; welke gegevens Mollie verwerkt, staat in hun
          privacyverklaring.
        </li>
        <li>Technische serverlogs van de hostingpartij kunnen IP-adressen bevatten. Wij gebruiken die alleen voor beveiliging en het tegengaan van misbruik.</li>
      </ul>

      <h2>Wat we niet doen</h2>
      <ul>
        <li>Geen analytics, advertentie- of trackingcookies.</li>
        <li>Geen opslag van adressen, bestandsnamen of documentinhoud op onze server.</li>
        <li>Geen verkoop of doorgifte van gegevens.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Verwerkingsverantwoordelijke: <CompanyField field="legalName" label="bedrijfsnaam" />, <CompanyField field="address" label="adres" />. KvK:{" "}
        <CompanyField field="kvkNumber" label="KvK-nummer" />. Vragen of een verzoek over je gegevens: <CompanyField field="email" label="e-mailadres" />.
      </p>
    </div>
  );
}
