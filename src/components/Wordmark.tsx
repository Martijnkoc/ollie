import Link from "next/link";

/** Own mark: a radar sweep over a pitch circle. No third-party branding. */
export function Wordmark() {
  return (
    <Link href="/" className="wordmark" aria-label="Voetbalradar, naar vandaag">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="14" fill="none" stroke="#314034" strokeWidth="2" />
        <circle cx="16" cy="16" r="8" fill="none" stroke="#314034" strokeWidth="2" />
        <path d="M16 16 L16 2 A14 14 0 0 1 28.1 9 Z" fill="#c8f03c" opacity="0.9" />
        <circle cx="16" cy="16" r="2.5" fill="#c8f03c" />
      </svg>
      <span className="wordmark-text">voetbalradar</span>
    </Link>
  );
}
