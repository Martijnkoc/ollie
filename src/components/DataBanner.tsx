import Link from "next/link";
import type { SiteStatus } from "@/lib/data";

/** Site-wide honesty: demo data, missing configuration and stale synchronisation are always visible. */
export function DataBanner({ status }: { status: SiteStatus }) {
  if (status.mode === "demo") {
    return (
      <div className="banner banner-demo" role="note">
        <div className="container">
          <strong>DEMO-OMGEVING</strong>
          <span>Alle clubs, spelers, uitslagen en statistieken op deze site zijn fictief. Dit is geen echte voetbaldata.</span>
        </div>
      </div>
    );
  }
  if (status.mode === "unconfigured") {
    return (
      <div className="banner banner-config" role="note">
        <div className="container">
          <strong>Dataconfiguratie ontbreekt</strong>
          <span>
            Er is nog geen voetbaldatabron gekoppeld. Deze site toont daarom geen wedstrijden. <Link href="/status" className="link">Status</Link>
          </span>
        </div>
      </div>
    );
  }
  if (status.degraded) {
    return (
      <div className="banner banner-stale" role="note">
        <div className="container">
          <strong>Gegevens mogelijk verouderd</strong>
          <span>
            De synchronisatie met de databron loopt achter. Scores kunnen niet actueel zijn. <Link href="/status" className="link">Status</Link>
          </span>
        </div>
      </div>
    );
  }
  return null;
}
