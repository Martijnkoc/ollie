/** "Go Ahead Eagles" → "go-ahead-eagles"; "1. FC Köln" → "1-fc-koln". */
export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "item";
}

/** Stable URLs carry our own numeric id at the end: "/team/ajax-12". */
export function withId(slug: string, id: number) {
  return `${slug}-${id}`;
}

/** Parses "ajax-12" → { slug: "ajax", id: 12 }. Returns null for anything else. */
export function parseSlugId(value: string): { slug: string; id: number } | null {
  const m = /^(?:([a-z0-9-]*?)-)?(\d{1,10})$/.exec(value);
  if (!m) return null;
  const id = Number(m[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { slug: m[1] ?? "", id };
}

export const teamPath = (team: { id: number; slug: string }) => `/team/${withId(team.slug, team.id)}`;

export function matchSlug(home: string, away: string, kickoffDay: string) {
  return `${slugify(home)}-${slugify(away)}-${kickoffDay}`;
}

export const competitionPath = (slug: string) => `/competitie/${slug}`;
