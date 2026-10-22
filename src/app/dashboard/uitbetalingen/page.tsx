import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { payoutDashboardAction, payoutOnboardingAction } from "@/app/actions/account";
import { requireActive } from "@/lib/access";
import { PLATFORM_FEE_BPS } from "@/lib/config";
import { getDb } from "@/lib/db";
import { canReceive, payoutAccount, refreshAccount } from "@/lib/payments";
import { stripeMode } from "@/lib/payments-client";

export const metadata: Metadata = { title: "Uitbetalingen", robots: { index: false } };

export default async function Payouts(props: PageProps<"/dashboard/uitbetalingen">) {
  const sp = await props.searchParams;
  const v = await requireActive("/dashboard/uitbetalingen");
  const db = await getDb();
  const mode = stripeMode();
  let account = await payoutAccount(db, v.user.id);
  let refreshError = false;
  if (sp.terug && account && mode !== "none") {
    try {
      account = await refreshAccount(db, v.user.id);
    } catch {
      refreshError = true;
    }
  }
  const ready = canReceive(account);
  return (
    <>
      <div>
        <p className="eyebrow">Uitbetalingen</p>
        <h1 style={{ margin: 0 }}>Geld ontvangen voor je werk</h1>
        <p className="muted" style={{ maxWidth: "62ch" }}>
          Kopers betalen via Sell Yourself. Na hun goedkeuring sturen we jouw deel ({100 - PLATFORM_FEE_BPS / 100}% van de prijs) naar je
          eigen uitbetaalaccount bij Stripe, onze betaalpartner. Stripe controleert eenmalig je identiteit en bankrekening; dat is wettelijk
          verplicht.
        </p>
      </div>
      {mode === "none" ? (
        <p className="notice warn">
          Online betalen is in deze omgeving nog niet geconfigureerd. Uitbetalingen instellen kan zodra de koppeling met Stripe actief is.
          Je kunt je profiel, werk en diensten wel al klaarzetten.
        </p>
      ) : (
        <section className="card stack">
          <div className="row between">
            <h2 style={{ fontSize: "1.2rem", margin: 0 }}>Status</h2>
            <span className={`badge ${ready ? "lime" : "warn"}`}>
              {ready ? "Klaar om te ontvangen" : account ? "Nog niet afgerond" : "Niet ingesteld"}
            </span>
          </div>
          {mode === "test" && <p className="small muted">Testmodus: gebruik de testgegevens van Stripe. Er wordt niets echt uitbetaald.</p>}
          {refreshError && <p className="notice error small">We konden de status nu niet ophalen bij Stripe. Probeer het zo nog eens.</p>}
          {account && (
            <dl className="kv" style={{ maxWidth: 420 }}>
              <dt>Gegevens ingevuld</dt>
              <dd>{account.details_submitted ? "Ja" : "Nee"}</dd>
              <dt>Overboekingen actief</dt>
              <dd>{account.transfers_active ? "Ja" : "Nee"}</dd>
              <dt>Uitbetalingen naar je bank</dt>
              <dd>{account.payouts_enabled ? "Aan" : "Nog niet"}</dd>
            </dl>
          )}
          {account && account.requirements_due.length > 0 && (
            <p className="notice warn small">Stripe heeft nog gegevens van je nodig om te kunnen uitbetalen.</p>
          )}
          <div className="row">
            <ActionForm action={payoutOnboardingAction}>
              <SubmitButton pendingText="Doorsturen naar Stripe…">
                {account ? (ready ? "Gegevens bijwerken" : "Verder met instellen") : "Uitbetalingen instellen"}
              </SubmitButton>
            </ActionForm>
            {ready && (
              <ActionForm action={payoutDashboardAction}>
                <SubmitButton className="btn secondary">Naar je Stripe-overzicht</SubmitButton>
              </ActionForm>
            )}
          </div>
        </section>
      )}
      <section className="stack small muted" aria-labelledby="hoe">
        <h2 id="hoe" style={{ fontSize: "1.1rem", color: "var(--ink)" }}>
          Hoe het werkt
        </h2>
        <ul style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 6 }}>
          <li>
            Je hebt geen abonnement. Per afgeronde opdracht gaat {PLATFORM_FEE_BPS / 100}% naar Sell Yourself; de betaalkosten van Stripe
            betalen wij.
          </li>
          <li>Het geld komt vrij als de koper de oplevering goedkeurt, of automatisch 7 dagen na je oplevering zonder reactie.</li>
          <li>Bij annuleren vóór goedkeuring krijgt de koper het volledige bedrag terug.</li>
          <li>Stripe stort je saldo volgens je uitbetaalschema op je bankrekening.</li>
        </ul>
      </section>
    </>
  );
}
