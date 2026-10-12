import Link from "next/link";
import { viewer } from "@/lib/access";
import { Wordmark } from "./Wordmark";

export async function SiteHeader() {
  const v = await viewer();
  return (
    <header className="site-header">
      <div className="container">
        <Wordmark />
        <nav className="site-nav" aria-label="Hoofdmenu">
          {!v && (
            <>
              <Link href="/#zo-werkt-het" className="hide-sm">
                Zo werkt het
              </Link>
              <Link href="/lidmaatschap">Lidmaatschap</Link>
              <Link href="/inloggen" className="btn small">
                Inloggen
              </Link>
            </>
          )}
          {v && (
            <>
              {v.community && <Link href="/cafe/lounge">Cafe</Link>}
              {v.community && <Link href="/berichten">Berichten</Link>}
              <Link href="/afspraken">Afspraken</Link>
              {v.community ? (
                <Link href="/uitnodigen" className="hide-sm">
                  Uitnodigen
                </Link>
              ) : (
                <Link href="/lidmaatschap">Lidmaatschap</Link>
              )}
              {v.staff && <Link href="/beheer">Beheer</Link>}
              <Link href="/account">Account</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
