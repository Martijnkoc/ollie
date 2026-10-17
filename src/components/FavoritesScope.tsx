"use client";

import { setFavoritesScope } from "@/lib/favorites";

/** Sets the favourites namespace (per data source) before any favourites component reads it. */
export function FavoritesScope({ scope }: { scope: string }) {
  setFavoritesScope(scope);
  return null;
}
