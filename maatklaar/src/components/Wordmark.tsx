import Link from "next/link";
import { BRAND } from "@/config/brand";
import { Logo } from "./brand/Logo";

/** The logo as the link home. */
export function Wordmark({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <Link href="/" className="wordmark" aria-label={`${BRAND.name}, naar de startpagina`}>
      <Logo tone={tone} />
    </Link>
  );
}
