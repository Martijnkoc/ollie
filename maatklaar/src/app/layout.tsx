import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { JsonLd } from "@/components/seo/JsonLd";
import { BRAND, siteUrl } from "@/config/brand";
import "./globals.css";

// One sans family for interface and marketing, served from our own domain.
const inter = localFont({ src: "./fonts/inter-latin-wght.woff2", variable: "--font-inter", display: "swap", weight: "100 900" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${BRAND.name} · ${BRAND.tagline.replace(/\.$/, "")} — vloer, verf en ramen berekenen`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  referrer: "same-origin",
  robots: { index: true, follow: true },
  // No canonical here: every public page sets its own, so none inherits the home page's.
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    locale: BRAND.locale,
    title: `${BRAND.name} · ${BRAND.tagline}`,
    description: BRAND.description,
  },
  twitter: { card: "summary_large_image", title: `${BRAND.name} · ${BRAND.tagline}`, description: BRAND.description },
  formatDetection: { telephone: false, address: false },
};

export const viewport: Viewport = {
  themeColor: BRAND.colors.offWhite,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const url = siteUrl();
  return (
    <html lang="nl" className={inter.variable} data-scroll-behavior="smooth">
      <body>
        <JsonLd
          data={[
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              "@id": `${url}/#organisatie`,
              name: BRAND.name,
              url,
              logo: `${url}/icon.svg`,
              slogan: BRAND.tagline,
            },
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              "@id": `${url}/#website`,
              name: BRAND.name,
              url,
              inLanguage: BRAND.language,
              publisher: { "@id": `${url}/#organisatie` },
            },
          ]}
        />
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
