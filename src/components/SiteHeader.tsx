import Link from "next/link";
import { viewer } from "@/lib/access";
import { getDb } from "@/lib/db";
import { unreadCount } from "@/lib/messages";
import { Avatar, Wordmark } from "./Visuals";
import { NavLink } from "./NavLink";
import { TabBar } from "./TabBar";

export async function SiteHeader() {
  const v = await viewer();
  const unread = v?.profile ? await unreadCount(await getDb(), v.user.id) : 0;
  return (
    <>
      <header className="site-header">
        <div className="container">
          <Wordmark />
          <nav className="site-nav" aria-label="Hoofdmenu">
            <NavLink href="/ontdek">Ontdek</NavLink>
            <NavLink href="/#categorieen">Categorieën</NavLink>
            <NavLink href="/hoe-het-werkt">Hoe het werkt</NavLink>
            {v?.profile && <NavLink href="/opdrachten">Opdrachten</NavLink>}
            {v?.profile && (
              <NavLink href="/berichten">
                Berichten
                {unread > 0 && (
                  <span className="count-dot" aria-label={`${unread} ongelezen`}>
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </NavLink>
            )}
            {v?.staff && <NavLink href="/beheer">Beheer</NavLink>}
          </nav>
          <div className="header-actions">
            <form action="/ontdek" role="search" className="header-search">
              <label htmlFor="header-q" className="visually-hidden">
                Zoek talent of diensten
              </label>
              <input id="header-q" type="search" name="q" placeholder="Zoek talent of diensten" />
            </form>
            {!v && (
              <>
                <Link href="/inloggen" className="btn ghost small">
                  Inloggen
                </Link>
                <Link href="/inloggen?next=%2Fwelkom%3Fverkopen%3D1" className="btn small hide-mobile">
                  Verkoop jouw talent
                </Link>
              </>
            )}
            {v && !v.profile && (
              <Link href="/welkom" className="btn small">
                Profiel afmaken
              </Link>
            )}
            {v?.profile && (
              <Link href="/dashboard" className="btn secondary small hide-mobile" aria-label="Naar je dashboard">
                <Avatar name={v.profile.display_name} url={v.profile.avatar_url} size={24} />
                Dashboard
              </Link>
            )}
          </div>
        </div>
      </header>
      <TabBar loggedIn={Boolean(v?.profile)} unread={unread} />
    </>
  );
}
