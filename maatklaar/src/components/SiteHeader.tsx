import Link from "next/link";
import { Wordmark } from "./Wordmark";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container">
        <Wordmark />
        <nav className="site-nav" aria-label="Hoofdmenu">
          <Link href="/#hoe-het-werkt">Hoe het werkt</Link>
          <Link href="/#prijs">Prijs</Link>
          <Link href="/#vragen">Vragen</Link>
          <Link href="/project">Mijn projecten</Link>
        </nav>
        <Link href="/project/nieuw" className="btn btn-primary btn-sm">
          Begin gratis
        </Link>
      </div>
    </header>
  );
}
