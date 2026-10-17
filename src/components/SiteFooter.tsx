import Link from "next/link";
import type { SiteStatus } from "@/lib/data";
import { formatDate, formatTime } from "@/lib/time";

export function SiteFooter({ status }: { status: SiteStatus }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="stack-sm">
          <span>
            <strong style={{ color: "var(--text-2)" }}>voetbalradar</strong> · livescores, standen en wedstrijdanalyses
          </span>
          <span>
            {status.providerLabel ? `Databron: ${status.providerLabel}. ` : "Geen databron gekoppeld. "}
            {status.lastSync ? `Laatste synchronisatie ${formatDate(status.lastSync)} ${formatTime(status.lastSync)}.` : ""} Alle tijden in Nederlandse tijd.
          </span>
        </div>
        <nav aria-label="Voettekst">
          <Link href="/competities">Competities</Link>
          <Link href="/over">Over Voetbalradar</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/status">Status</Link>
        </nav>
      </div>
    </footer>
  );
}
