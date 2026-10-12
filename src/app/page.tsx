import Link from "next/link";
import { DATE_MINUTES, TAGLINE } from "@/lib/config";

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="eyebrow">Videodates van {DATE_MINUTES} minuten</p>
          <h1>{TAGLINE}</h1>
          <p className="lead">
            Zie en spreek elkaar twintig minuten op video voordat je afspreekt. Daarna kiest ieder rustig, en privé, of
            jullie verder willen.
          </p>
          <div className="doors">
            <Link href="/uitnodigen" className="door primary">
              <h2>Ik heb al een match</h2>
              <p>
                Nodig iemand die je via een app of ergens anders leerde kennen uit voor jullie besloten videodate. Gratis
                voor je match, zonder download.
              </p>
              <span className="go">Match uitnodigen →</span>
            </Link>
            <Link href="/ontmoeten" className="door">
              <h2>Ik wil iemand ontmoeten</h2>
              <p>
                Meld je aan voor een kennismakingsavond. Wij stellen je voor aan iemand die bij je past, en jullie zeggen
                allebei vooraf ja.
              </p>
              <span className="go">Aanmelden →</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container stack-lg">
          <div>
            <h2>Wat je wilt weten vóór een date</h2>
            <p className="muted" style={{ maxWidth: "38em" }}>
              Daarvoor hoeft niemand een lange vragenlijst in te vullen. Je ziet elkaar, spreekt elkaar twintig minuten en
              beslist daarna rustig verder.
            </p>
          </div>
          <div className="grid-3">
            <div className="card flat">
              <h3>Spreekt deze persoon me aan?</h3>
              <p className="muted">Ook als die beweegt, lacht en praat, en niet alleen op een foto.</p>
            </div>
            <div className="card flat">
              <h3>Voelt het gesprek prettig?</h3>
              <p className="muted">Ontspannen, met ruimte voor elkaar, zonder dat het moeite kost.</p>
            </div>
            <div className="card flat">
              <h3>Hebben we allebei zin?</h3>
              <p className="muted">Om elkaar daadwerkelijk te ontmoeten. Dat weet je pas als jullie het allebei zeggen.</p>
            </div>
          </div>
          <p className="muted small">
            Een prettige videodate geeft je meer informatie. De klik in het echt blijft iets om samen te ontdekken.
          </p>
        </div>
      </section>

      <section className="section" id="hoe-het-werkt">
        <div className="container stack-lg">
          <h2>Zo werkt het</h2>
          <ol className="steps">
            <li>
              <strong>Uitnodigingslink</strong>
              <span className="muted">Jij maakt de afspraak aan en stuurt je match een link.</span>
            </li>
            <li>
              <strong>Moment kiezen</strong>
              <span className="muted">Je match kiest een van jouw momenten. Zonder account of download.</span>
            </li>
            <li>
              <strong>Besloten videodate</strong>
              <span className="muted">Twintig minuten, alleen jullie twee. Daarna sluit de ruimte vanzelf.</span>
            </li>
            <li>
              <strong>Privé keuze</strong>
              <span className="muted">Ieder kiest voor zich of die verder wil. Een &lsquo;nee&rsquo; ziet niemand.</span>
            </li>
            <li>
              <strong>Vervolg</strong>
              <span className="muted">Willen jullie allebei? Dan deel je zelf je contactgegevens.</span>
            </li>
          </ol>
          <div className="grid-2">
            <div className="card soft">
              <h3>Waarom precies twintig minuten?</h3>
              <p>
                Iedereen weet vooraf hoeveel tijd die vrijmaakt. Het gesprek eindigt vanzelf, dus niemand hoeft een reden
                te verzinnen om op te hangen. Daarna kies je zonder sociale druk of je verder wilt.
              </p>
            </div>
            <div className="card soft">
              <h3>Afspraken waar je op kunt rekenen</h3>
              <ul className="checks">
                <li>Gratis voor wie wordt uitgenodigd: geen account, download of betaalgegevens.</li>
                <li>Je contactgegevens blijven verborgen tot jij ze deelt.</li>
                <li>Blokkeren en melden kan altijd, ook tijdens en na de date.</li>
                <li>Jouw keuze en feedback blijven vertrouwelijk.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="card">
            <p className="eyebrow">Binnenkort</p>
            <h2>Cafe</h2>
            <p style={{ maxWidth: "40em" }}>
              Een ontmoetingsplek waar je binnenloopt, met mensen praat en elkaar uitnodigt voor een videodate van twintig
              minuten. &lsquo;Vanavond heb ik even tijd. Wie zit er in Cafe?&rsquo;
            </p>
            <Link href="/cafe" className="btn secondary">
              Bekijk Cafe
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
