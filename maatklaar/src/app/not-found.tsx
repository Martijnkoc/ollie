import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container section">
      <h1>Pagina niet gevonden</h1>
      <p className="muted">Deze pagina bestaat niet (meer).</p>
      <div className="row">
        <Link className="btn btn-primary" href="/">
          Naar de startpagina
        </Link>
        <Link className="btn" href="/project">
          Mijn projecten
        </Link>
      </div>
    </div>
  );
}
