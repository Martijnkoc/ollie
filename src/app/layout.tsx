import type { Metadata, Viewport } from "next";
import { Archivo, Inter_Tight } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { BRAND, HEADLINE, TAGLINE } from "@/lib/config";
import { stripeMode } from "@/lib/payments-client";
import "./globals.css";

const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-display", display: "swap" });
const sans = Inter_Tight({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${BRAND} · ${HEADLINE}`, template: `%s · ${BRAND}` },
  description: `Ontdek talent, vind een professional of verdien geld met wat jij kunt. Creators, fotografen, developers, schilders, coaches en meer. ${TAGLINE}`,
  // Personal pages carry ids in the URL; never send them to other sites.
  referrer: "same-origin",
};

export const viewport: Viewport = {
  themeColor: "#101112",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${display.variable} ${sans.variable}`}>
      <body>
        <a href="#inhoud" className="skip-link">
          Naar de inhoud
        </a>
        {stripeMode() === "test" && (
          <div className="test-banner">Testomgeving: betalingen lopen via Stripe-testmodus. Er wordt geen echt geld afgeschreven.</div>
        )}
        <SiteHeader />
        <main id="inhoud" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
