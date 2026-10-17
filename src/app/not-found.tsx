import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container page stack" style={{ maxWidth: 640 }}>
      <h1>Niet gevonden</h1>
      <p className="muted">Deze pagina bestaat niet (meer). Misschien is de wedstrijd verplaatst of door de databron verwijderd.</p>
      <div className="row">
        <Link className="btn btn-primary" href="/">
          Wedstrijden van vandaag
        </Link>
        <Link className="btn" href="/competities">
          Competities
        </Link>
      </div>
    </div>
  );
}
