import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { config } from "@/lib/env";
import { absoluteUrl, isIndexable } from "@/lib/seo";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const cfg = config();
  if (!isIndexable(cfg)) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/beheer", "/status", "/favorieten"] }],
    sitemap: absoluteUrl(cfg, "/sitemap.xml"),
  };
}
