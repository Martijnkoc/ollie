import Link from "next/link";

export default function GoodbyePage() {
  return (
    <div className="container narrow section stack">
      <h1>Je gegevens zijn verwijderd</h1>
      <p className="muted">Bedankt dat je meedeed. Je bent altijd welkom om opnieuw te beginnen.</p>
      <Link className="btn secondary" href="/">
        Naar de homepage
      </Link>
    </div>
  );
}
