import type { Metadata } from "next";
import { BRAND } from "@/config/brand";

/** The link preview from src/app/opengraph-image.tsx; resolved against metadataBase. */
export const SHARE_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: `${BRAND.name}: ${BRAND.promise}` };

/**
 * Metadata for a public, indexable page. Next merges metadata shallowly, so a page that only sets a title would share
 * the home page's Open Graph and Twitter texts, and a page that sets its own openGraph loses the shared image. This sets
 * all of them per page.
 */
export function pageMetadata({
  title,
  description,
  path,
  type = "website",
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type, title, description, url: path, siteName: BRAND.name, locale: BRAND.locale, images: [SHARE_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [SHARE_IMAGE] },
  };
}
