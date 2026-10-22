import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container narrow page stack">
      <p className="eyebrow">404</p>
      <h1>Niet gevonden</h1>
      <p className="lead">Deze pagina bestaat niet (meer), is niet openbaar, of je hebt er met dit account geen toegang toe.</p>
      <div className="row">
        <Link className="btn" href="/ontdek">
          Ontdek talent
        </Link>
        <Link className="btn secondary" href="/">
          Naar de homepage
        </Link>
      </div>
    </div>
  );
}
