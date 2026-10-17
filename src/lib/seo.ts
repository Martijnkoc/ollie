import type { AppConfig } from "./env";

/**
 * Only a production deployment with real data may be indexed. Demo data, missing configuration
 * and Vercel preview deployments are always `noindex`.
 */
export function isIndexable(cfg: AppConfig, env: Record<string, string | undefined> = process.env) {
  const vercelEnv = env.VERCEL_ENV;
  return cfg.dataMode === "live" && cfg.production && (vercelEnv === undefined || vercelEnv === "production");
}

export function absoluteUrl(cfg: AppConfig, path: string) {
  return `${cfg.siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Serialises JSON-LD safely for a <script> tag (no closing-tag injection). */
export function jsonLdString(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function breadcrumbLd(cfg: AppConfig, items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: absoluteUrl(cfg, item.path) })),
  };
}
