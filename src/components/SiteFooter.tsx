import Link from "next/link";
import { CATEGORIES, TAGLINE } from "@/lib/config";
import { Wordmark } from "./Visuals";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Wordmark />
            <p className="footer-claim">{TAGLINE}</p>
          </div>
          <nav aria-labelledby="f-ontdek">
            <h2 id="f-ontdek">Ontdekken</h2>
            <ul>
              <li>
                <Link href="/ontdek">Alle talenten</Link>
              </li>
              {CATEGORIES.slice(0, 4).map((c) => (
                <li key={c.key}>
                  <Link href={`/ontdek?categorie=${c.key}`}>{c.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-labelledby="f-platform">
            <h2 id="f-platform">Platform</h2>
            <ul>
              <li>
                <Link href="/hoe-het-werkt">Boeken, contact en betalen</Link>
              </li>
              <li>
                <Link href="/hoe-het-werkt#kosten">Platformkosten</Link>
              </li>
              <li>
                <Link href="/inloggen?next=%2Fwelkom%3Fverkopen%3D1">Verkoop jouw talent</Link>
              </li>
              <li>
                <Link href="/voorwaarden#richtlijnen">Richtlijnen</Link>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="f-over">
            <h2 id="f-over">Over</h2>
            <ul>
              <li>
                <Link href="/voorwaarden">Voorwaarden</Link>
              </li>
              <li>
                <Link href="/privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/contact">Contact</Link>
              </li>
              <li>
                <Link href="/contact#misbruik">Misbruik melden</Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Sell Yourself · Gemaakt in Nederland</span>
          <span>Voorwaarden en privacyverklaring zijn een concept en worden juridisch getoetst vóór de lancering.</span>
        </div>
      </div>
    </footer>
  );
}
