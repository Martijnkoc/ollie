import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { BRAND, TAGLINE } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${BRAND} · ${TAGLINE}`, template: `%s · ${BRAND}` },
  description:
    "Spreek je match twintig minuten op video voordat je afspreekt. Daarna kies je rustig en privé of je verder wilt. Gratis voor wie wordt uitgenodigd, zonder download.",
  // Personal links live in the URL; never send them to other sites.
  referrer: "same-origin",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf6ee" },
    { media: "(prefers-color-scheme: dark)", color: "#17110e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand" aria-label={`${BRAND}, naar de homepage`}>
              <span className="brand-mark" aria-hidden>
                ◐
              </span>
              {BRAND}
            </Link>
            <nav className="site-nav" aria-label="Hoofdmenu">
              <Link href="/#hoe-het-werkt" className="hide-sm">
                Hoe het werkt
              </Link>
              <Link href="/uitnodigen">Uitnodigen</Link>
              <Link href="/ontmoeten">Ontmoeten</Link>
              <Link href="/cafe">Cafe</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="container">
            <span>
              {BRAND} · {TAGLINE}
            </span>
            <span className="row">
              <Link href="/huisregels">Huisregels &amp; veiligheid</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/link-kwijt">Link kwijt?</Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
