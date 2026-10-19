import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { BRAND } from "@/config/site";
import "./globals.css";

const inter = localFont({ src: "./fonts/inter-latin-wght.woff2", variable: "--font-inter", display: "swap", weight: "100 900" });
const fraunces = localFont({ src: "./fonts/fraunces-latin-wght.woff2", variable: "--font-fraunces", display: "swap", weight: "100 900" });

export const metadata: Metadata = {
  title: { default: `${BRAND.name} · ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description:
    "Upload je plattegrond, controleer de herkende kamers en bereken gratis hoeveel vloer je nodig hebt. Voor € 8,99 eenmalig ook plinten, ramen en meetgegevens voor raamdecoratie in één PDF-rapport.",
  referrer: "same-origin",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#f6f3ec",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${inter.variable} ${fraunces.variable}`} data-scroll-behavior="smooth">
      <body>
        <a href="#inhoud" className="skip-link">
          Naar de inhoud
        </a>
        <SiteHeader />
        <main id="inhoud" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
