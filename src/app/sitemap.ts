import type { MetadataRoute } from "next";
import { readContext } from "@/lib/data";
import { getSitemapData } from "@/lib/football/queries";
import { absoluteUrl, isIndexable } from "@/lib/seo";
import { config } from "@/lib/env";

/**
 * Only indexable pages with real content: competitions (and their standings), current teams, and
 * matches that were played or are scheduled within two weeks. Never in demo mode.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const read = await readContext();
  const cfg = config();
  if (!read || !isIndexable(cfg)) return [];
  const data = await getSitemapData(read);
  const url = (path: string) => absoluteUrl(cfg, path);
  return [
    { url: url("/"), changeFrequency: "always", priority: 1 },
    { url: url("/competities"), changeFrequency: "weekly", priority: 0.6 },
    ...data.competitions.flatMap((c) => [
      { url: url(c.path), lastModified: c.updatedAt, changeFrequency: "daily" as const, priority: 0.9 },
      { url: url(`${c.path}/stand`), lastModified: c.updatedAt, changeFrequency: "daily" as const, priority: 0.8 },
      { url: url(`${c.path}/uitslagen`), changeFrequency: "daily" as const, priority: 0.6 },
      { url: url(`${c.path}/programma`), changeFrequency: "daily" as const, priority: 0.6 },
    ]),
    ...data.teams.map((t) => ({ url: url(t.path), lastModified: t.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
    ...data.matches.map((m) => ({ url: url(m.path), lastModified: m.updatedAt, changeFrequency: "hourly" as const, priority: 0.5 })),
  ];
}
