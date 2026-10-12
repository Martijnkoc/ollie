"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container narrow section stack">
      <h1>Er ging iets mis</h1>
      <p className="muted">Dat ligt aan ons, niet aan jou. Probeer het nog eens.</p>
      <button type="button" className="btn" onClick={reset}>
        Opnieuw proberen
      </button>
    </div>
  );
}
