"use client";

import { useState } from "react";
import { PRICE } from "@/config/site";
import { startCheckout, refreshPayment } from "./payment-client";
import { PlinthSection } from "./PlinthSection";
import { WindowSection } from "./WindowSection";
import { isPaid, type StepProps } from "./types";

const STATUS_TEXT: Record<string, string> = {
  open: "Je betaling is gestart maar nog niet bevestigd door de betaalprovider.",
  pending: "Je betaling wordt nog verwerkt.",
  failed: "Je betaling is niet gelukt. Er is niets afgeschreven.",
  canceled: "Je hebt de betaling geannuleerd.",
  expired: "De betaling is verlopen. Je kunt het opnieuw proberen.",
  refunded: "Je betaling is terugbetaald. Het volledige rapport is daarom niet meer ontgrendeld.",
};

export function DemoNotice() {
  return (
    <p className="notice notice-demo" role="note">
      DEMO-modus: er is niet echt betaald. Dit project is ontgrendeld met een nagebootste betaling om de app te testen. Het rapport krijgt
      een DEMO-stempel.
    </p>
  );
}

function Checkout(props: StepProps) {
  const { project, update, flush, payment, computed } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = project.payment;

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const order = await startCheckout(project.id);
      update((prev) => ({
        ...prev,
        payment: {
          orderId: order.orderId,
          orderSecret: order.orderSecret,
          status: "open",
          mode: order.mode,
          checkedAt: new Date().toISOString(),
        },
      }));
      // The project must be on disk before we leave the page for the payment provider.
      await flush();
      window.location.assign(order.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Betalen lukt nu niet.");
      setBusy(false);
    }
  }

  async function check() {
    if (!p) return;
    setBusy(true);
    const next = await refreshPayment(p).catch(() => null);
    if (next) update((prev) => ({ ...prev, payment: next }));
    else setError("De status kon nu niet worden opgehaald. Probeer het zo opnieuw.");
    setBusy(false);
  }

  const roomsWithShape = computed.rooms.filter((r) => r.geometry.edgesMm).length;

  return (
    <section className="panel stack" aria-labelledby="stap-betaald">
      <div className="panel-head">
        <div>
          <h2 id="stap-betaald" tabIndex={-1}>
            Plinten, ramen en je complete rapport
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Eén keer {PRICE.label} voor dit woningproject. Geen abonnement, geen extra&apos;s achteraf.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack-sm">
          <ul className="ticks">
            <li>
              Plinten voor{" "}
              {roomsWithShape > 0
                ? `${roomsWithShape} ${roomsWithShape === 1 ? "ruimte" : "ruimtes"} met een bekende vorm`
                : "elke ruimte met een bekende vorm"}
              : per wand, met deuren en marge
            </li>
            <li>
              Raamregister
              {project.windows.length ? ` (nu ${project.windows.length} ${project.windows.length === 1 ? "raam" : "ramen"})` : ""} met
              begeleid meetprotocol en afwijkingscontrole
            </li>
            <li>Persoonlijk PDF-rapport (A4) met winkelchecklist, aannames en bronnen</li>
            <li>CSV-bestellijst voor je eigen overzicht of de winkel</li>
          </ul>
          <p className="small muted" style={{ margin: 0 }}>
            Wat je krijgt is zo betrouwbaar als de maten die je invult en bevestigt. Bestelmaten voor raamdecoratie volgen de meetinstructie
            van je leverancier; die verzinnen wij niet.
          </p>
        </div>
        <div className="card stack-sm">
          <div className="plan-price">
            {PRICE.label}
            <small>{PRICE.period}</small>
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>
            {PRICE.vatNote}
            {PRICE.vatNoteVerified ? "" : " (concept)"}
          </p>
          {payment.mode === "demo" && (
            <p className="notice notice-demo small">DEMO-modus: je doorloopt een nagebootste betaling. Er wordt geen geld afgeschreven.</p>
          )}
          {payment.mode === "test" && <p className="notice notice-warn small">{payment.label}</p>}
          {p && p.status !== "paid" && (
            <p className="notice small" role="status">
              {STATUS_TEXT[p.status] ?? ""}
            </p>
          )}
          {error && (
            <p className="notice notice-error small" role="alert">
              {error}
            </p>
          )}
          {payment.available ? (
            <>
              <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => void pay()}>
                {busy ? "Even geduld…" : `Betaal ${PRICE.label} en ontgrendel`}
              </button>
              {p && (p.status === "open" || p.status === "pending") && (
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void check()}>
                  Status van mijn betaling controleren
                </button>
              )}
              <p className="tiny muted" style={{ margin: 0 }}>
                {payment.mode === "demo"
                  ? "Je gaat naar een nagebootste betaalpagina van MaatKlaar zelf."
                  : "Je gaat naar de beveiligde betaalpagina van Mollie (iDEAL en meer)."}{" "}
                Je project blijft bewaard in deze browser; kom na het betalen terug in dezelfde browser.
              </p>
            </>
          ) : (
            <p className="notice small">{payment.label} Je gratis vloerberekening blijft gewoon beschikbaar.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function PaidStep(props: StepProps) {
  if (!isPaid(props.project)) return <Checkout {...props} />;
  return (
    <div className="stack">
      {props.project.payment?.mode === "demo" && <DemoNotice />}
      <PlinthSection {...props} />
      <WindowSection {...props} />
      <div className="row">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => props.goTo("rapport")}>
          Naar mijn rapport
        </button>
      </div>
    </div>
  );
}
