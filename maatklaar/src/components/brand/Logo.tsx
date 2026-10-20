import { BRAND } from "@/config/brand";

/**
 * The mark: a graphite carpenter's square with scale ticks and a signal-orange measuring corner. Together they
 * frame a rectangle, the way a room or a window opening is measured. Our own drawing; readable from 16 px.
 */
export function LogoMark({ className = "logo-mark", title }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path d="M4 4h5v19h19v5H4z" fill={BRAND.colors.graphite} />
      <path d="M13 23v2.6M17 23v2.6M21 23v2.6M25 23v2.6" stroke={BRAND.colors.offWhite} strokeWidth="1.4" />
      <path d="M15 4h13v13h-4V8h-9z" fill={BRAND.colors.signal} />
    </svg>
  );
}

/** Mark plus word mark. The word comes from the brand configuration, so a rename is one change. */
export function Logo({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <span className="logo">
      <LogoMark />
      <span className="logo-word" style={tone === "light" ? { color: BRAND.colors.offWhite } : undefined}>
        {BRAND.name}
      </span>
    </span>
  );
}
