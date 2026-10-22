import Link from "next/link";
import { categoryLabel } from "@/lib/config";
import { Mark } from "./Icons";

export function Wordmark() {
  return (
    <Link href="/" className="wordmark" aria-label="Sell Yourself, naar de homepage">
      <Mark className="mark" />
      <span>
        Sell <span className="y">Yourself</span>
      </span>
    </Link>
  );
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** A person's photo, or their initials. Decorative when a name is printed next to it. */
export function Avatar({
  name,
  url,
  size = 40,
  className = "",
}: {
  name: string;
  url: string | null;
  /** null: the size comes from CSS (for responsive avatars). */
  size?: number | null;
  className?: string;
}) {
  const style = size == null ? undefined : ({ "--size": `${size}px` } as React.CSSProperties);
  if (url)
    return (
      <img
        src={url}
        alt=""
        className={`avatar ${className}`}
        style={style}
        width={size ?? undefined}
        height={size ?? undefined}
        loading="lazy"
        decoding="async"
      />
    );
  return (
    <span className={`avatar ${className}`} style={style} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Deterministic variant so the same item always gets the same composition. */
export function variantOf(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ["", "v1", "v2", "v3"][h % 4];
}

/** Brand typography instead of an image. Never a stock photo pretending to be someone's work. */
export function TypeArt({
  seed,
  title,
  kicker,
  className = "",
  style,
}: {
  seed: string;
  title: string;
  kicker?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`type-art ${variantOf(seed)} ${className}`} style={style} aria-hidden="true">
      {kicker ? <small>{kicker}</small> : <span />}
      <span className="big">{title}</span>
    </div>
  );
}

export function CategoryKicker({ category }: { category: string }) {
  return <>{categoryLabel(category)}</>;
}

export function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="stars" role="img" aria-label={`${rating.toLocaleString("nl-NL")} van 5 sterren`}>
      {"★".repeat(full)}
      <span style={{ opacity: 0.25 }}>{"★".repeat(5 - full)}</span>
    </span>
  );
}
