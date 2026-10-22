import type { Metadata } from "next";

export const metadata: Metadata = { title: "Huisregels & veiligheid" };

export default function RulesPage() {
  return (
    <div className="container narrow page stack-lg">
      <div>
        <h1>Huisregels &amp; veiligheid</h1>
        <p className="lead">
          Cafe werkt alleen als iedereen zich welkom voelt. Deze afspraken gelden overal: aan tafel, privé en op video.
        </p>
      </div>
      <section className="stack">
        <h2>Wat we van iedereen vragen</h2>
        <ul className="checks">
          <li>Je bent 18 jaar of ouder en doet mee als jezelf.</li>
          <li>Je bent vriendelijk, ook als het niet klikt. Een &lsquo;nee&rsquo; is een prima antwoord.</li>
          <li>Geen naaktheid, seksuele toespelingen zonder dat de ander dat wil, of intimidatie.</li>
          <li>Je neemt gesprekken niet op en maakt geen screenshots zonder toestemming.</li>
          <li>Je vraagt nooit om geld, cadeaus of betaalgegevens.</li>
          <li>Geen reclame of spam.</li>
        </ul>
      </section>
      <section className="stack">
        <h2>Wat jij altijd kunt doen</h2>
        <ul className="checks">
          <li>
            <strong>Blokkeren:</strong> jullie zien elkaar niet meer en nieuwe berichten, verzoeken en uitnodigingen zijn niet mogelijk.
          </li>
          <li>
            <strong>Melden:</strong> een moderator bekijkt het. De ander ziet niet dat je iets meldde.
          </li>
          <li>
            <strong>Vroeg stoppen:</strong> een videodate beëindigen kan altijd.
          </li>
          <li>
            <strong>Zelf delen:</strong> contactgegevens deel je alleen als jullie allebei verder willen, en per gegeven.
          </li>
        </ul>
      </section>
      <section className="stack">
        <h2>Hoe we modereren</h2>
        <p>
          Elke maatregel is een besluit van een mens, met een vastgelegde reden. Niet klikken, een afwijzing of een &lsquo;nee&rsquo; is
          nooit een reden voor een maatregel. Ben je het niet eens met een beperking van je account? Dan kun je bezwaar maken; een andere
          moderator bekijkt het.
        </p>
      </section>
      <section className="stack">
        <h2>Als je daarna echt afspreekt</h2>
        <ul className="checks">
          <li>Kies een openbare plek en regel je eigen vervoer.</li>
          <li>Laat iemand weten waar je bent en met wie.</li>
          <li>Een e-mailcode bevestigt een e-mailadres, geen identiteit. Vertrouw op je gevoel; je mag altijd weggaan.</li>
        </ul>
        <p className="muted small">Bij direct gevaar: bel 112. Voor de politie zonder spoed: 0900-8844.</p>
      </section>
    </div>
  );
}
