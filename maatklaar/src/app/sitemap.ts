import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/brand";
import { GUIDES } from "@/content/guides";

/** Public pages only. Projects, payments and hand-offs are personal and stay out (see robots.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  const url = siteUrl();
  const page = (path: string, priority: number, lastModified = "2026-10-20") => ({ url: `${url}${path}`, lastModified, priority });
  return [
    page("", 1),
    page("/gidsen", 0.8),
    ...GUIDES.map((g) => page(`/gidsen/${g.slug}`, 0.7, g.updated)),
    page("/hoe-we-meten", 0.6),
    page("/privacy", 0.2),
    page("/voorwaarden", 0.2),
    page("/contact", 0.2),
  ];
}
