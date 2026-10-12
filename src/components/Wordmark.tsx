import Link from "next/link";

export function Wordmark() {
  return (
    <Link href="/" className="wordmark" aria-label="Cafe, naar de homepage">
      cafe
      <span className="dot" aria-hidden>
        .
      </span>
    </Link>
  );
}
