"use client";

import Link from "next/link";
import { useFavorites } from "@/lib/favorites";
import { competitionPath } from "@/lib/slug";

export function FavoritesSide({ competitions }: { competitions: { id: number; name: string; slug: string }[] }) {
  const { favorites } = useFavorites();
  const mine = competitions.filter((c) => favorites.competitions.includes(c.id));
  return (
    <>
      <div className="side-title">Favorieten</div>
      <ul className="side-list">
        {mine.map((c) => (
          <li key={c.id}>
            <Link href={competitionPath(c.slug)}>{c.name}</Link>
          </li>
        ))}
        <li>
          <Link href="/favorieten">
            <span className="dim">
              {favorites.teams.length + mine.length > 0 ? `Alle favorieten (${favorites.teams.length} clubs)` : "Nog geen favorieten"}
            </span>
          </Link>
        </li>
      </ul>
    </>
  );
}
