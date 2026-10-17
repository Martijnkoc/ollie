const SKIP = new Set([
  "fc",
  "sc",
  "sv",
  "vv",
  "afc",
  "cf",
  "ac",
  "as",
  "ssc",
  "rc",
  "cd",
  "ud",
  "sd",
  "fk",
  "sk",
  "bk",
  "if",
  "the",
  "de",
  "1.",
  "club",
]);

/** Up to two letters from the meaningful words of a club name: "FC Polderstad" → "PO", "Rivierdam United" → "RU". */
export function initials(name: string) {
  const words = name
    .replace(/['’.]/g, "")
    .split(/[\s-]+/)
    .filter((w) => w && !SKIP.has(w.toLowerCase()) && !/^\d+$/.test(w));
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Club logos are trademarks of the clubs. They are only shown when SHOW_PROVIDER_LOGOS is on
 * (after checking the licence); otherwise a neutral typographic crest is used.
 */
export function TeamCrest({ name, id, logoUrl, size }: { name: string; id: number; logoUrl: string | null; size?: "md" | "lg" }) {
  const cls = `crest${size ? ` crest-${size}` : ""}`;
  if (logoUrl) {
    const px = size === "lg" ? 64 : size === "md" ? 40 : 22;
    return (
      <span className={cls} style={{ background: "transparent" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- external, licence-gated logos; no optimiser proxy */}
        <img src={logoUrl} alt="" width={px} height={px} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      </span>
    );
  }
  return (
    <span className={cls} style={{ ["--crest-hue" as string]: (id * 47) % 360 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
