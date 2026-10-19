"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ACCEPTED_FILES, LIMITS, PRICE } from "@/config/site";
import type { AddressSuggestion } from "@/lib/address/types";
import { newProject } from "@/lib/projects/factory";
import { setHandoff } from "@/lib/projects/handoff";
import { saveProject } from "@/lib/projects/store";

/**
 * Start straight from the hero: pick an address (PDOK suggestions) or drop a plan. Either creates a project
 * on this device and continues in it, where the address lookup and the plan analysis run with their real
 * progress. Nothing is uploaded from here.
 */
export function HeroStart() {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [message, setMessage] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setMessage(null);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/adres/zoek?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as { suggestions?: AddressSuggestion[]; error?: string };
        if (n !== seq.current) return;
        const list = res.ok && Array.isArray(body.suggestions) ? body.suggestions : [];
        setSuggestions(list);
        setActive(-1);
        setOpen(true);
        setMessage(
          !res.ok ? (body.error ?? "Zoeken lukt nu niet.") : list.length ? null : "Geen adres gevonden. Probeer postcode en huisnummer.",
        );
      } catch {
        if (n === seq.current) setMessage("Geen verbinding. Controleer je internet en probeer het opnieuw.");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function start(handoff: { suggestion?: AddressSuggestion; file?: File }, hash = "") {
    setBusy(true);
    const p = newProject();
    try {
      await saveProject(p);
    } catch {
      setBusy(false);
      setMessage("Je browser staat lokaal opslaan niet toe. Probeer een gewoon (niet-privé) venster.");
      return;
    }
    setHandoff({ projectId: p.id, ...handoff });
    router.push(`/project/${p.id}${hash}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      void start({ suggestion: suggestions[active]! });
    } else if (e.key === "Escape") setOpen(false);
  }

  function file(f: File | undefined) {
    if (!f) return;
    if (f.size > LIMITS.maxUploadBytes) {
      setMessage(`Dit bestand is groter dan ${Math.round(LIMITS.maxUploadBytes / 1024 / 1024)} MB.`);
      return;
    }
    void start({ file: f }, "#plattegrond");
  }

  return (
    <div className="hero-start stack-sm">
      <div className="field combo">
        <label htmlFor="hero-adres">Adres van de woning</label>
        <input
          id="hero-adres"
          className="input"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="Postcode en huisnummer, bijv. 1234AB 12"
          value={query}
          disabled={busy}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && suggestions.length > 0 && (
          <ul className="combo-list" role="listbox" id={listId} aria-label="Gevonden adressen">
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void start({ suggestion: s });
                }}
              >
                {s.weergavenaam}
              </li>
            ))}
          </ul>
        )}
      </div>

      <label
        className="dropzone hero-drop"
        data-over={over}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          file(e.dataTransfer.files[0]);
        }}
      >
        <strong>Of kies je plattegrond</strong>
        <span className="small muted">
          {ACCEPTED_FILES.label} tot {Math.round(LIMITS.maxUploadBytes / 1024 / 1024)} MB · je kunt hem ook hierheen slepen
        </span>
        <input
          type="file"
          accept={ACCEPTED_FILES.accept}
          className="visually-hidden"
          disabled={busy}
          onChange={(e) => file(e.target.files?.[0])}
        />
      </label>

      {message && (
        <p className="small" role="status" style={{ margin: 0 }}>
          {message}
        </p>
      )}

      <div className="hero-cta">
        <Link href="/project/nieuw" className="btn btn-primary btn-lg">
          Breng mijn woning in kaart
        </Link>
      </div>
      <p className="price-line">
        Basis gratis · Compleet rapport {PRICE.label} {PRICE.period} · Geen abonnement
      </p>
      <p className="tiny muted" style={{ margin: 0 }}>
        Je plattegrond wordt in je eigen browser gelezen en blijft op je apparaat; je kunt hem altijd verwijderen. Alleen je
        adreszoekopdracht gaat via onze server naar PDOK. Zie het <Link href="/privacy">privacybeleid</Link>.
      </p>
    </div>
  );
}
