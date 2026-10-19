import Link from "next/link";
import { BRAND, SOURCES } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div>
          <p>
            <strong>{BRAND.name}</strong>
            {BRAND.isWorkingTitle ? <span className="tiny muted"> (werktitel)</span> : null} — {BRAND.tagline}
          </p>
          <p className="small">
            Berekeningen zijn zo betrouwbaar als de maten die je aanlevert en bevestigt. Bestelmaten voor raamdecoratie volgen de regels van
            je leverancier.
          </p>
        </div>
        <div>
          <ul>
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
        </div>
        <div className="small">
          <p>Adres- en gebouwgegevens: {SOURCES.bag}.</p>
          <p>Geen tracking, geen advertenties. Je plattegrond blijft op je eigen apparaat.</p>
        </div>
      </div>
    </footer>
  );
}
