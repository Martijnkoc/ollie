import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { TAGLINE } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `Cafe · ${TAGLINE}`, template: "%s · Cafe" },
  description:
    "Een korte, besloten videodate van twintig minuten voordat je afspreekt. Neem je match van een andere app mee, of leer mensen kennen in de Cafe-community.",
  // Personal pages carry ids in the URL; never send them to other sites.
  referrer: "same-origin",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f1e8" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1019" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <a href="#inhoud" className="skip-link">
          Naar de inhoud
        </a>
        <SiteHeader />
        <main id="inhoud" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          <div className="container">
            <span>cafe. · {TAGLINE}</span>
            <span className="row">
              <Link href="/huisregels">Huisregels &amp; veiligheid</Link>
              <Link href="/privacy">Privacy</Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
