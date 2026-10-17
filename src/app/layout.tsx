import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { DataBanner } from "@/components/DataBanner";
import { FavoritesScope } from "@/components/FavoritesScope";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { siteStatus, type SiteStatus } from "@/lib/data";
import { getDb } from "@/lib/db";
import { config } from "@/lib/env";
import { isIndexable } from "@/lib/seo";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const cfg = config();
  const indexable = isIndexable(cfg);
  return {
    metadataBase: new URL(cfg.siteUrl),
    title: { default: "Voetbalradar · Livescores, uitslagen en standen", template: "%s · Voetbalradar" },
    description:
      "Livescores, uitslagen, programma's en standen van de Eredivisie, de grote Europese competities, de Champions League en de Europa League. Snel, overzichtelijk en eerlijk over de actualiteit van de gegevens.",
    applicationName: "Voetbalradar",
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { siteName: "Voetbalradar", locale: "nl_NL", type: "website" },
    referrer: "strict-origin-when-cross-origin",
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#0a0e0b",
  colorScheme: "dark",
};

/** Banner and footer reflect runtime configuration and sync state, so the shell is never prerendered. */
async function loadStatus(): Promise<SiteStatus> {
  await connection();
  const cfg = config();
  if (!cfg.provider) return siteStatus(null, cfg);
  try {
    return await siteStatus(await getDb(), cfg);
  } catch (err) {
    console.error("[layout] status unavailable", err instanceof Error ? err.message : err);
    return { ...(await siteStatus(null, cfg)), degraded: true };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const status = await loadStatus();
  const cfg = config();
  return (
    <html lang="nl">
      <body>
        <FavoritesScope scope={cfg.provider ?? "none"} />
        <a href="#inhoud" className="skip-link">
          Naar de inhoud
        </a>
        <SiteHeader searchable={cfg.provider !== null} />
        <DataBanner status={status} />
        <main id="inhoud" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter status={status} />
      </body>
    </html>
  );
}
