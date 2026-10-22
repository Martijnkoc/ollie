import type { Metadata } from "next";
import Link from "next/link";
import { viewer } from "@/lib/access";
import { creditSummary } from "@/lib/billing/credits";
import { stripeMode } from "@/lib/billing/stripe";
import { CheckoutButton, PortalButton } from "@/components/forms/BillingButtons";
import { DATE_MINUTES, MEMBERSHIP } from "@/lib/config";
import { getDb } from "@/lib/db";
import { formatMoment } from "@/lib/time";

export const metadata: Metadata = { title: "Lidmaatschap" };

const STATUS: Record<string, string> = {
  active: "Actief",
  trialing: "Proefperiode",
  past_due: "Betaling mislukt, Stripe probeert het opnieuw",
  canceled: "Beëindigd",
  unpaid: "Onbetaald",
  incomplete: "Betaling nog niet afgerond",
  incomplete_expired: "Betaling verlopen",
  paused: "Gepauzeerd",
};

export default async function MembershipPage(props: PageProps<"/lidmaatschap">) {
  const query = await props.searchParams;
  const v = await viewer();
  const mode = stripeMode();
  const credits = v ? await creditSummary(await getDb(), v.user.id) : null;
  const m = v?.membership;

  return (
    <div className="container narrow page stack-lg">
      <div>
        <p className="eyebrow">{v && !v.profile ? "Stap 2 van 2 · Lidmaatschap" : "Lidmaatschap"}</p>
        <h1>Lid worden van Cafe</h1>
        <p className="lead">Eén abonnement, maandelijks opzegbaar.</p>
      </div>

      {query.betaling === "verwerken" && !v?.member && (
        <p className="notice lime" role="status">
          Bedankt. Stripe verwerkt je betaling. Zodra wij de bevestiging van Stripe hebben ontvangen, staat je lidmaatschap hier als actief.
          Ververs de pagina over een moment.
        </p>
      )}
      {query.betaling === "afgebroken" && <p className="notice">De betaling is afgebroken. Er is niets afgeschreven.</p>}

      <div className="card stack">
        <p className="price">
          {MEMBERSHIP.priceLabel} <small>per {MEMBERSHIP.period}</small>
        </p>
        <ul className="checks">
          <li>De community: lounge, tafels, ledenlijst en privégesprekken</li>
          <li>
            {MEMBERSHIP.datesPerPeriod} videodates van {DATE_MINUTES} minuten per {MEMBERSHIP.period}, ook met een match van een andere app
          </li>
          <li>Wie je uitnodigt, betaalt niets voor die videodate</li>
        </ul>
        <p className="muted small">{MEMBERSHIP.priceNote}</p>
        <details>
          <summary>Hoe telt het tegoed?</summary>
          <p className="muted">
            Wie uitnodigt of een videodate voorstelt, gebruikt een videodate van het eigen tegoed. Die wordt gereserveerd zodra jullie
            allebei bevestigen, en pas verbruikt als het gesprek echt begint. Zegt iemand af, komt iemand niet opdagen of lukt de verbinding
            niet vóór de start, dan krijg je hem terug. Een gesprek tussen twee leden kost alleen de organisator iets.
          </p>
        </details>
      </div>

      {!v && (
        <div className="card flat stack">
          <h2>Begin met een account</h2>
          <p className="muted">Log in met je e-mailadres, maak je profiel en kies daarna het lidmaatschap.</p>
          <Link className="btn" href="/inloggen?next=/welkom">
            Account maken
          </Link>
        </div>
      )}

      {v && !v.profile && (
        <div className="card flat stack">
          <h2>Eerst je profiel</h2>
          <Link className="btn" href="/welkom?next=/lidmaatschap">
            Profiel maken
          </Link>
        </div>
      )}

      {v?.profile && (
        <div className="card flat stack" aria-live="polite">
          <h2>Jouw lidmaatschap</h2>
          {v.restricted && <p className="notice error">Je account is beperkt. Zie je accountpagina.</p>}
          {m ? (
            <dl className="stack">
              <div>
                <dt className="muted small">Status</dt>
                <dd style={{ margin: 0, fontWeight: 650 }}>
                  {v.member ? "Actief" : (STATUS[m.status] ?? m.status)}
                  {m.cancel_at_period_end && v.member ? " · loopt af aan het einde van de periode" : ""}
                </dd>
              </div>
              {m.current_period_end && (
                <div>
                  <dt className="muted small">{m.cancel_at_period_end ? "Toegang tot" : "Huidige periode loopt tot"}</dt>
                  <dd style={{ margin: 0 }}>{formatMoment(m.current_period_end)}</dd>
                </div>
              )}
              {credits?.active && (
                <div>
                  <dt className="muted small">Videodates deze periode</dt>
                  <dd style={{ margin: 0 }}>
                    {credits.used} van {credits.quota} gebruikt · nog {credits.available} over
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="muted">Je hebt nog geen lidmaatschap.</p>
          )}

          {mode === "none" ? (
            <p className="notice warn" role="status">
              Betalen is nog niet geconfigureerd. Er kan nu niemand lid worden; er wordt ook niets afgeschreven.
            </p>
          ) : (
            <>
              {mode === "test" && <span className="badge demo">Testmodus: er wordt geen echt geld afgeschreven</span>}
              {!v.member && !v.restricted && <CheckoutButton label="Lid worden" />}
              {m?.stripe_customer_id && <PortalButton />}
            </>
          )}
          {v.member && (
            <p className="muted small">
              Na opzeggen houd je toegang tot het einde van de betaalde periode. Videodates die al vaststaan binnen die periode gaan gewoon
              door.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
