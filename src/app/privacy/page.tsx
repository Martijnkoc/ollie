import type { Metadata } from "next";
import { BRAND } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="container narrow section stack-lg">
      <div>
        <h1>Privacy</h1>
        <p className="muted">Kort en duidelijk: wat {BRAND} van je bewaart, en waarom.</p>
      </div>
      <section className="stack">
        <h2>Wat we bewaren</h2>
        <ul className="checks">
          <li>
            <strong>Bij een uitnodiging:</strong> de voornamen, het e-mailadres van wie uitnodigt, het gekozen moment en (als je
            dat opgeeft) het e-mailadres van de gast.
          </li>
          <li>
            <strong>Bij de community:</strong> je voornaam, e-mail, geboortedatum, regio, voorkeuren en je zin over jezelf.
          </li>
          <li>
            <strong>Na een date:</strong> jouw keuze, je antwoord op onze ene feedbackvraag en wat je zelf besluit te delen.
          </li>
        </ul>
      </section>
      <section className="stack">
        <h2>Wat we níet doen</h2>
        <ul className="checks">
          <li>We nemen videodates niet op. Beeld en geluid gaan rechtstreeks via onze videopartner en worden niet bewaard.</li>
          <li>We tonen je e-mailadres aan niemand.</li>
          <li>We laten nooit zien dat iemand &lsquo;nee&rsquo; heeft gezegd. De ander ziet alleen dat er geen vervolg is.</li>
          <li>We verkopen geen gegevens en hebben geen openbare profielen of feed.</li>
        </ul>
      </section>
      <section className="stack">
        <h2>Jouw rechten</h2>
        <p>
          Je kunt je communityprofiel altijd zelf verwijderen via je persoonlijke pagina. Voor inzage of verwijdering van andere
          gegevens kun je contact met ons opnemen.
        </p>
      </section>
    </div>
  );
}
