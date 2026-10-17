"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SearchIcon } from "./Icons";

interface Entry {
  type: "team" | "competition";
  id: number;
  name: string;
  context: string;
  path: string;
}

function normalise(s: string) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Search for clubs and competitions. The small index loads on first focus and is filtered in the
 * browser, so typing never hits the server. Keyboard: arrows to move, Enter to open, Escape to close.
 */
export function SearchBox() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (entries || failed) return;
    try {
      const res = await fetch("/api/v1/search");
      if (!res.ok) throw new Error();
      setEntries(((await res.json()) as { entries: Entry[] }).entries);
    } catch {
      setFailed(true);
    }
  };

  const results = useMemo(() => {
    const q = normalise(query.trim());
    if (!q || !entries) return [];
    return entries
      .map((e) => {
        const n = normalise(e.name);
        const score = n.startsWith(q) ? 0 : n.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : 3;
        return { e, score };
      })
      .filter((r) => r.score < 3)
      .sort((a, b) => a.score - b.score || (a.e.type === "competition" ? -1 : 1) || a.e.name.localeCompare(b.e.name))
      .slice(0, 8)
      .map((r) => r.e);
  }, [query, entries]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (entry: Entry) => {
    setOpen(false);
    setQuery("");
    router.push(entry.path);
  };

  const showList = open && query.trim().length > 0;
  return (
    <div className="search" ref={box}>
      <SearchIcon />
      <input
        type="search"
        role="combobox"
        aria-label="Zoek een club of competitie"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        placeholder="Zoek club of competitie"
        autoComplete="off"
        value={query}
        onFocus={() => {
          void load();
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            go(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul className="search-results" id={listId} role="listbox" aria-label="Zoekresultaten">
          {results.map((r, i) => (
            <li key={`${r.type}-${r.id}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <a
                href={r.path}
                tabIndex={-1}
                onClick={(e) => {
                  e.preventDefault();
                  go(r);
                }}
              >
                <span>{r.name}</span>
                <span className="kind">{r.type === "competition" ? `Competitie · ${r.context}` : r.context}</span>
              </a>
            </li>
          ))}
          {results.length === 0 && (
            <li className="search-empty dim" role="option" aria-selected={false} aria-disabled="true">
              {failed ? "Zoeken is nu niet beschikbaar." : entries ? "Niets gevonden." : "Laden…"}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
