"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container narrow page stack" role="alert">
      <h1>Er ging iets mis</h1>
      <p className="muted">Dat ligt aan ons, niet aan jou. Probeer het nog eens; je gegevens zijn niet verloren.</p>
      <button type="button" className="btn" onClick={reset}>
        Opnieuw proberen
      </button>
    </div>
  );
}
