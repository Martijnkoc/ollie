"use client";

import { useState } from "react";

export function DemoCheckout({ orderId, priceLabel }: { orderId: string; priceLabel: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(outcome: "paid" | "canceled") {
    setBusy(true);
    setError(null);
    // The order secret is in the URL fragment, which the browser never sends to a server.
    const secret = window.location.hash.slice(1);
    const res = await fetch("/api/demo/betalingen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, secret, outcome }) }).catch(() => null);
    if (!res?.ok) {
      setError("Deze DEMO-betaling kon niet worden afgerond.");
      setBusy(false);
      return;
    }
    window.location.assign(`/betaling/terug?order=${encodeURIComponent(orderId)}`);
  }

  return (
    <div className="container app-shell">
      <div className="panel stack" style={{ maxWidth: 560, margin: "0 auto" }}>
        <p className="notice notice-demo">DEMO-MODUS — dit is geen echte betaalpagina. Er wordt geen geld afgeschreven en er is geen betaalprovider gekoppeld.</p>
        <h1 style={{ fontSize: "1.8rem" }}>Nagebootste betaling</h1>
        <p className="muted">
          Hiermee test je de volledige flow: na &ldquo;betalen&rdquo; controleert de server de (nagebootste) betaalstatus, net als bij een echte betaling. Bedrag: {priceLabel}.
        </p>
        <p className="small muted">
          Bestelling: <span className="code">{orderId || "onbekend"}</span>
        </p>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={busy || !orderId} onClick={() => void finish("paid")}>
            Simuleer geslaagde betaling
          </button>
          <button type="button" className="btn" disabled={busy || !orderId} onClick={() => void finish("canceled")}>
            Simuleer annuleren
          </button>
        </div>
      </div>
    </div>
  );
}
