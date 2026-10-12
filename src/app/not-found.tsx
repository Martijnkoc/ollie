import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container narrow page stack">
      <h1>Niet gevonden</h1>
      <p className="muted">Deze pagina bestaat niet, of je hebt er geen toegang toe met dit account.</p>
      <div className="row">
        <Link className="btn" href="/afspraken">
          Naar je afspraken
        </Link>
        <Link className="btn secondary" href="/">
          Naar de homepage
        </Link>
      </div>
    </div>
  );
}
