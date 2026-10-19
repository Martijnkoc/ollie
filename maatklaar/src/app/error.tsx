"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container section">
      <h1>Er ging iets mis</h1>
      <p className="muted">Je project staat veilig op je apparaat. Probeer het opnieuw; lukt het niet, ververs dan de pagina.</p>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Opnieuw proberen
        </button>
        <Link className="btn" href="/project">
          Mijn projecten
        </Link>
      </div>
    </div>
  );
}
