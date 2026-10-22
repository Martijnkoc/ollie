"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Chat, Discover, Home, User } from "./Icons";

/** Phone navigation at thumb height. Hidden from 900px, where the header takes over. */
export function TabBar({ loggedIn, unread }: { loggedIn: boolean; unread: number }) {
  const path = usePathname();
  const is = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  const tabs = loggedIn
    ? [
        { href: "/", label: "Home", icon: <Home /> },
        { href: "/ontdek", label: "Ontdek", icon: <Discover /> },
        { href: "/opdrachten", label: "Opdrachten", icon: <Briefcase /> },
        { href: "/berichten", label: "Berichten", icon: <Chat />, count: unread },
        { href: "/dashboard", label: "Ik", icon: <User /> },
      ]
    : [
        { href: "/", label: "Home", icon: <Home /> },
        { href: "/ontdek", label: "Ontdek", icon: <Discover /> },
        { href: "/inloggen?next=%2Fwelkom%3Fverkopen%3D1", label: "Verkopen", icon: <Briefcase /> },
        { href: "/inloggen", label: "Inloggen", icon: <User /> },
      ];
  return (
    <nav className="tabbar" aria-label="Snelmenu" style={{ "--tabs": tabs.length } as React.CSSProperties}>
      {tabs.map((t) => (
        <Link key={t.label} href={t.href} aria-current={is(t.href.split("?")[0]) && t.href.indexOf("?") === -1 ? "page" : undefined}>
          {t.icon}
          {t.label}
          {"count" in t && t.count ? (
            <span className="count-dot" aria-label={`${t.count} ongelezen`}>
              {t.count > 9 ? "9+" : t.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
