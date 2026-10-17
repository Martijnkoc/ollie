"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container page stack" style={{ maxWidth: 640 }} role="alert">
      <h1>Er ging iets mis</h1>
      <p className="muted">
        Deze pagina kon niet worden geladen. Dat ligt aan ons, niet aan jou. Mogelijk is de database even niet bereikbaar. We tonen liever
        niets dan een verkeerde stand.
      </p>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Opnieuw proberen
        </button>
        <a className="btn" href="/status">
          Status bekijken
        </a>
      </div>
    </div>
  );
}
