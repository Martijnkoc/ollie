import Link from "next/link";
import { BRAND, SOURCES } from "@/config/site";
import { GUIDE_INDEX } from "@/content/guide-index";
import { Wordmark } from "./Wordmark";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="stack-sm">
          <Wordmark tone="light" />
          <p style={{ margin: 0, color: "#e7e9e6", fontWeight: 600 }}>{BRAND.rule}</p>
          <p className="small" style={{ margin: 0 }}>
            {BRAND.promise} Berekeningen zijn zo betrouwbaar als de maten die je aanlevert en bevestigt; bestelmaten voor raamdecoratie
            volgen de gecontroleerde regels van je leverancier.
          </p>
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <ul>
            <li>
              <Link href="/#hoe-het-werkt">Hoe het werkt</Link>
            </li>
            <li>
              <Link href="/#scantag">Ramen meten met ScanTag</Link>
            </li>
            <li>
              <Link href="/#prijs">Prijs</Link>
            </li>
            <li>
              <Link href="/project">Mijn projecten</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Gidsen">
          <h2>Gidsen</h2>
          <ul>
            {GUIDE_INDEX.slice(0, 6).map((g) => (
              <li key={g.slug}>
                <Link href={`/gidsen/${g.slug}`}>{g.nav}</Link>
              </li>
            ))}
            <li>
              <Link href="/gidsen">Alle gidsen</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Over">
          <h2>Over</h2>
          <ul>
            <li>
              <Link href="/hoe-we-meten">Hoe we meten en rekenen</Link>
            </li>
            <li>
              <Link href="/privacy">Privacy</Link>
            </li>
            <li>
              <Link href="/voorwaarden">Voorwaarden</Link>
            </li>
            <li>
              <Link href="/contact">Contact</Link>
            </li>
          </ul>
          <p className="tiny" style={{ marginTop: 16 }}>
            Adres- en gebouwgegevens: {SOURCES.bag}. Geen tracking, geen advertenties.
          </p>
        </nav>
      </div>
    </footer>
  );
}
