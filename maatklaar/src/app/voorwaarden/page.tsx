import type { Metadata } from "next";
import { CompanyField, DraftBanner } from "@/components/Legal";
import { BRAND, PRICE } from "@/config/site";

export const metadata: Metadata = { title: "Voorwaarden", alternates: { canonical: "/voorwaarden" } };

export default function TermsPage() {
  return (
    <div className="container section-tight legal">
      <DraftBanner
        checklist={[
          "Bedrijfsgegevens invullen (naam, adres, KvK, btw-nummer)",
          "Btw-behandeling van de prijs bevestigen en de prijsweergave daarop afstemmen",
          "Herroepingsrecht bij digitale inhoud toetsen (afstand doen bij directe levering, met uitdrukkelijke toestemming vóór betaling)",
          "Terugbetalingsbeleid vastleggen",
          "Aansprakelijkheidsbepalingen juridisch laten toetsen",
        ]}
      />
      <h1>Voorwaarden</h1>
      <p className="muted">
        Deze voorwaarden gelden voor het gebruik van {BRAND.name}, aangeboden door <CompanyField field="legalName" label="bedrijfsnaam" />.
      </p>

      <h2>Wat {BRAND.name} doet</h2>
      <p>
        {BRAND.name} helpt je met het berekenen van materiaalhoeveelheden op basis van een plattegrond en maten die jij aanlevert en
        controleert. De vloerberekening is gratis. Het volledige meet- en bestelrapport kost {PRICE.label} {PRICE.period} per woningproject.
        Er is geen abonnement.
      </p>

      <h2>Nauwkeurigheid</h2>
      <p>
        Automatische herkenning kan fouten maken. Elke waarde krijgt daarom een label en jij bevestigt de maten. De uitkomsten zijn zo
        betrouwbaar als de maten die je aanlevert en bevestigt. Bestelmaten voor raamdecoratie volgen de meetinstructies van de leverancier
        die je kiest; {BRAND.name} verzint geen leveranciersregels. Controleer kritieke maten altijd in de woning voordat je bestelt.
      </p>

      <h2>Je bestanden</h2>
      <p>
        Je mag alleen bestanden gebruiken waarvoor je toestemming hebt. {BRAND.name} claimt geen rechten op je plattegrond; die wordt niet
        naar onze server gestuurd.
      </p>

      <h2>Betaling</h2>
      <p>
        Betalingen lopen via Mollie. Het rapport wordt ontgrendeld nadat Mollie de betaling aan ons heeft bevestigd. {PRICE.vatNote}
        {PRICE.vatNoteVerified ? "" : " (Concept: btw-behandeling wordt vóór de lancering bevestigd.)"}
      </p>

      <h2>Contact</h2>
      <p>
        <CompanyField field="email" label="e-mailadres" />
      </p>
    </div>
  );
}
