import Link from "next/link";
import { BRAND } from "@/config/site";

/** Logo: a folded floor plan corner with a measuring tick. */
export function Wordmark() {
  return (
    <Link href="/" className="wordmark" aria-label={`${BRAND.name}, naar de startpagina`}>
      <svg className="wordmark-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="2" y="2" width="28" height="28" rx="8" fill="#1f4d3a" />
        <path d="M9 23V9h14" fill="none" stroke="#f6f3ec" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 16h7v7" fill="none" stroke="#f6f3ec" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 13v-2.5M23 13v-2.5" stroke="#b98c3c" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span>{BRAND.name}</span>
    </Link>
  );
}
