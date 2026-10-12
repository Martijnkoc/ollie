import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container narrow section stack">
      <h1>Deze link werkt niet (meer)</h1>
      <p className="muted">
        Misschien is hij niet helemaal goed gekopieerd, of is de uitnodiging ingetrokken. Persoonlijke links kun je opnieuw
        opvragen.
      </p>
      <div className="row">
        <Link className="btn" href="/link-kwijt">
          Link opnieuw opvragen
        </Link>
        <Link className="btn secondary" href="/">
          Naar de homepage
        </Link>
      </div>
    </div>
  );
}
