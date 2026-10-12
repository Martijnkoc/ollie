import type { Metadata } from "next";
import { BRAND, DATE_MINUTES } from "@/lib/config";

export const metadata: Metadata = { title: "Huisregels & veiligheid" };

export default function RulesPage() {
  return (
    <div className="container narrow section stack-lg">
      <div>
        <h1>Huisregels &amp; veiligheid</h1>
        <p className="muted">
          {BRAND} werkt alleen als iedereen zich welkom voelt. Deze afspraken gelden voor elke videodate en elke kennismaking.
        </p>
      </div>
      <section className="stack">
        <h2>Wat we van iedereen vragen</h2>
        <ul className="checks">
          <li>Je bent 18 jaar of ouder en doet mee als jezelf.</li>
          <li>Je bent vriendelijk en respectvol, ook als het niet klikt.</li>
          <li>Geen naaktheid, seksuele toespelingen zonder dat de ander dat wil, of intimidatie.</li>
          <li>Je neemt het gesprek niet op en maakt geen screenshots zonder toestemming.</li>
          <li>Je vraagt nooit om geld, cadeaus of betaalgegevens.</li>
          <li>Een &lsquo;nee&rsquo; is een prima antwoord. Je respecteert het.</li>
        </ul>
      </section>
      <section className="stack">
        <h2>Wat jij altijd kunt doen</h2>
        <ul className="checks">
          <li>
            <strong>Blokkeren:</strong> tijdens of na de date. Een geplande afspraak stopt dan en jullie worden niet meer aan
            elkaar voorgesteld.
          </li>
          <li>
            <strong>Melden:</strong> we behandelen meldingen vertrouwelijk en los van je feedback. De ander ziet niet dat je iets
            meldde.
          </li>
          <li>
            <strong>Zelf beslissen wat je deelt:</strong> je contactgegevens blijven verborgen tot je ze zelf deelt, en alleen als
            jullie allebei verder willen.
          </li>
          <li>
            <strong>Op tijd stoppen:</strong> na {DATE_MINUTES} minuten sluit de ruimte vanzelf. Je mag ook eerder weggaan.
          </li>
        </ul>
      </section>
      <section className="stack">
        <h2>Als je daarna echt afspreekt</h2>
        <ul className="checks">
          <li>Kies een openbare plek en regel je eigen vervoer.</li>
          <li>Laat iemand weten waar je bent en met wie.</li>
          <li>Vertrouw op je gevoel. Je mag altijd weggaan.</li>
        </ul>
        <p className="muted small">Voel je je bedreigd? Bel in Nederland 112 bij direct gevaar, of 0900-8844 voor de politie.</p>
      </section>
    </div>
  );
}
