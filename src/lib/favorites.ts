"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Anonymous favourites, kept only in this browser (localStorage). Nothing is sent to us except
 * the ids in a request for matches, and no account is needed.
 *
 * The store is behind a small interface so accounts with synchronised favourites can replace it
 * later without touching components.
 */
export interface Favorites {
  teams: number[];
  competitions: number[];
}

export type FavoriteKind = keyof Favorites;

const EMPTY: Favorites = { teams: [], competitions: [] };
const EVENT = "vr:favorites";
const MAX = 50;

let scope = "default";
let cache: { key: string; raw: string | null; value: Favorites } | null = null;

const storageKey = () => `voetbalradar:favorites:v1:${scope}`;

/** Favourites are per data source, so demo ids never mix with real ones. */
export function setFavoritesScope(value: string) {
  scope = value;
  cache = null;
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(storageKey());
  } catch {
    return null;
  }
}

export function parseFavorites(raw: string | null): Favorites {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw) as Partial<Favorites>;
    const clean = (list: unknown) =>
      Array.isArray(list) ? [...new Set(list.filter((n): n is number => Number.isSafeInteger(n) && n > 0))].slice(0, MAX) : [];
    return { teams: clean(data.teams), competitions: clean(data.competitions) };
  } catch {
    return EMPTY;
  }
}

export function toggled(current: Favorites, kind: FavoriteKind, id: number): Favorites {
  const list = current[kind];
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(-MAX);
  return { ...current, [kind]: next };
}

function snapshot(): Favorites {
  const raw = readRaw();
  const key = storageKey();
  if (!cache || cache.key !== key || cache.raw !== raw) cache = { key, raw, value: parseFavorites(raw) };
  return cache.value;
}

function subscribe(onChange: () => void) {
  const handler = (e: Event) => {
    if (e instanceof StorageEvent && e.key !== null && e.key !== storageKey()) return;
    onChange();
  };
  window.addEventListener("storage", handler);
  window.addEventListener(EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(EVENT, handler);
  };
}

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const toggle = useCallback((kind: FavoriteKind, id: number) => {
    const next = toggled(snapshot(), kind, id);
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(next));
    } catch {
      // Private mode or storage disabled: favourites simply do not persist.
    }
    cache = null;
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { favorites, toggle };
}
