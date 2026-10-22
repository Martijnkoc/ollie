import type { Metadata } from "next";
import Link from "next/link";
import { Arrow } from "@/components/Icons";
import { AUTO_COMPLETE_DAYS, OVERDUE_GRACE_DAYS, PLATFORM_FEE_BPS, QUOTE_VALID_DAYS } from "@/lib/config";
import { formatEuro, split } from "@/lib/money";
import { stripeMode } from "@/lib/payments-client";

export const metadata: Metadata = {
  title: "Hoe het werkt",
  description: "Boeken, contact, betalen, platformkosten, annuleren en klachten op Sell Yourself.",
};

export default function HowItWorks() {
  const example = split(10_000);
  const pct = (PLATFORM_FEE_BPS / 100).toLocaleString("nl-NL");
  return (
    <>
      <section className="section" style={{ paddingBottom: 48 }}>
        <div className="container mid stack">
          <p className="eyebrow">Hoe het werkt</p>
          <h1 style={{ fontSize: "clamp(2.6rem, 7vw, 5rem)", maxWidth: "14ch" }}>Duidelijk voor wie koopt. Eerlijk voor wie verkoopt.</h1>
          <p className="lead">Alles over boeken, contact, betalen, kosten, annuleren en klachten. Zonder kleine lettertjes.</p>
          {stripeMode() === "none" && (
            <p className="notice warn">
              Online betalen is in deze omgeving nog niet actief. Zodra de betaalkoppeling live is, werkt het zoals hieronder beschreven.
            </p>
          )}
        </div>
      </section>

      <section className="section paper">
        <div className="container mid stack-lg">
          <div className="grid-2">
            <div className="card stack" style={{ background: "#fff" }}>
              <span className="badge lime" style={{ background: "#101112", color: "#C5FF38", width: "fit-content" }}>
                Direct boeken
              </span>
              <h2 style={{ fontSize: "1.8rem" }}>Vaste prijs, vaste levertijd</h2>
              <ol style={{ paddingLeft: 20, margin: 0, display: "grid", gap: 8 }}>
                <li>Je kiest een dienst en eventuele uitbreidingen.</li>
                <li>Je ziet de totaalprijs en bevestigt uitdrukkelijk: &lsquo;Bestellen met betaalverplichting&rsquo;.</li>
                <li>Je betaalt via Stripe (iDEAL of creditcard). Pas daarna start de opdracht.</li>
              </ol>
            </div>
            <div className="card stack" style={{ background: "#fff" }}>
              <span className="badge outline" style={{ width: "fit-content" }}>
                Op aanvraag
              </span>
              <h2 style={{ fontSize: "1.8rem" }}>Eerst overleg, dan een offerte</h2>
              <ol style={{ paddingLeft: 20, margin: 0, display: "grid", gap: 8 }}>
                <li>Je beschrijft je opdracht, met budget en planning als je die weet.</li>
                <li>Jullie stellen vragen in de chat. De maker stuurt een offerte, {QUOTE_VALID_DAYS} dagen geldig.</li>
                <li>Je accepteert de offerte uitdrukkelijk en betaalt. Afwijzen of intrekken kan altijd vóór betaling.</li>
              </ol>
            </div>
          </div>

          <div className="stack" id="contact">
            <h2>Contact</h2>
            <p className="lead">
              Je kunt elke maker met een openbaar profiel een bericht sturen. Berichten over een opdracht staan ook bij die opdracht. Deel
              geen betaalgegevens in berichten en betaal nooit buiten het platform: dan ben je niet beschermd.
            </p>
          </div>

          <div className="stack" id="betalen">
            <h2>Betalen en uitbetalen</h2>
            <ul className="checklist">
              <li>Je betaalt de afgesproken prijs aan Sell Yourself, via onze betaalpartner Stripe. Kopers betalen geen servicekosten.</li>
              <li>Het geld blijft staan tot jij de oplevering goedkeurt. Pas dan gaat het naar de maker.</li>
              <li>
                Reageer je niet, dan keuren we een oplevering na {AUTO_COMPLETE_DAYS} dagen automatisch goed. Dat staat duidelijk bij je
                opdracht.
              </li>
              <li>Makers worden uitbetaald op hun eigen Stripe-account, na een eenmalige identiteitscontrole door Stripe.</li>
            </ul>
          </div>

          <div className="stack" id="kosten">
            <h2>Platformkosten</h2>
            <p className="lead">
              Makers betalen {pct}% van de afgesproken prijs, alleen over afgeronde opdrachten. Geen abonnement, geen kosten voor een
              profiel of een dienst. De betaalkosten van Stripe betalen wij.
            </p>
            <div className="card" style={{ background: "#fff", maxWidth: 460 }}>
              <dl className="kv">
                <dt>Koper betaalt</dt>
                <dd>{formatEuro(example.price)}</dd>
                <dt>Platformkosten ({pct}%)</dt>
                <dd>− {formatEuro(example.fee)}</dd>
                <dt className="total" style={{ color: "#101112" }}>
                  Maker ontvangt
                </dt>
                <dd className="total" style={{ color: "#101112" }}>
                  {formatEuro(example.seller)}
                </dd>
              </dl>
            </div>
            <p className="small muted">
              Je ziet deze verdeling altijd vóórdat je iets afspreekt: bij het bestellen, in de offerte en bij elke opdracht.
            </p>
          </div>

          <div className="stack" id="annuleren">
            <h2>Annuleren</h2>
            <ul className="checklist">
              <li>Vóór betaling: de koper kan intrekken, de maker kan afwijzen. Er is niets betaald, dus er hoeft niets terug.</li>
              <li>
                Na betaling, vóór goedkeuring: de maker kan altijd annuleren met volledige terugbetaling. De koper kan vragen om te
                annuleren.
              </li>
              <li>
                Is de levertijd {OVERDUE_GRACE_DAYS} dagen verstreken zonder oplevering, dan kan de koper zelf annuleren en krijgt alles
                terug.
              </li>
              <li>
                Koop je bij een zakelijke verkoper, dan heb je daarnaast je wettelijke rechten als consument, zoals het herroepingsrecht.
              </li>
            </ul>
          </div>

          <div className="stack" id="klachten">
            <h2>Klachten en reviews</h2>
            <ul className="checklist">
              <li>Komen jullie er niet uit, dien dan een klacht in bij de opdracht. Automatisch afronden stopt dan.</li>
              <li>
                Een moderator bekijkt de opdracht, de tijdlijn en jullie berichten en besluit: terugbetalen, uitbetalen of verder met de
                opdracht. Beide partijen zien de uitleg.
              </li>
              <li>
                Reviews kunnen alleen na een afgeronde opdracht, één per opdracht, door de koper. De maker kan één keer openbaar reageren.
              </li>
              <li>We tonen geen gekochte reviews, geen verzonnen cijfers en geen populariteitsscores.</li>
            </ul>
          </div>

          <div className="row">
            <Link href="/ontdek" className="btn dark large">
              Ontdek talent <Arrow />
            </Link>
            <Link href="/voorwaarden" className="btn secondary large">
              Lees de voorwaarden
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
