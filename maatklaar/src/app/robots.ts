import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/brand";

/** Personal projects, payments, hand-off links and the API are never for search engines. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/project", "/betaling", "/overdracht", "/api/"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
