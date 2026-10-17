"use client";

import { useFavorites, type FavoriteKind } from "@/lib/favorites";
import { StarIcon } from "./Icons";

export function FavoriteToggle({ kind, id, name, withLabel = false }: { kind: FavoriteKind; id: number; name: string; withLabel?: boolean }) {
  const { favorites, toggle } = useFavorites();
  const on = favorites[kind].includes(id);
  const label = on ? `${name} verwijderen uit favorieten` : `${name} toevoegen aan favorieten`;
  if (withLabel) {
    return (
      <button type="button" className="btn" aria-pressed={on} onClick={() => toggle(kind, id)}>
        <span className="star" aria-hidden="true" style={{ width: 18, height: 18, color: on ? "var(--lime)" : undefined }}>
          <StarIcon filled={on} />
        </span>
        {on ? "Favoriet" : "Volgen"}
        <span className="visually-hidden">: {label}</span>
      </button>
    );
  }
  return (
    <button type="button" className="star" aria-pressed={on} aria-label={label} title={label} onClick={() => toggle(kind, id)}>
      <StarIcon filled={on} />
    </button>
  );
}
