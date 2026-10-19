"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SOURCES } from "@/config/site";
import { addressSchema, buildingSchema, type AddressSuggestion } from "@/lib/address/types";
import { formatM2 } from "@/lib/format";
import { BuildingOutline } from "./BuildingOutline";
import type { StepProps } from "./types";

type RunState = "running" | "done" | "failed" | "skipped";
type Progress = { key: string; label: string; state: RunState; detail?: string }[];

async function getJson(url: string): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return { ok: res.ok, body: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, body: { error: "Geen verbinding. Controleer je internet en probeer het opnieuw." } };
  }
}

export function AddressStep({ project, update, goTo }: StepProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setSearchError(null);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      const { ok, body } = await getJson(`/api/adres/zoek?q=${encodeURIComponent(q)}`);
      if (n !== seq.current) return;
      setSearching(false);
      if (!ok) {
        setSearchError(typeof body.error === "string" ? body.error : "Zoeken lukt nu niet.");
        setSuggestions([]);
        return;
      }
      const list = Array.isArray(body.suggestions) ? (body.suggestions as AddressSuggestion[]) : [];
      setSearchError(list.length ? null : "Geen adres gevonden. Probeer postcode en huisnummer, bijvoorbeeld 1234AB 12.");
      setSuggestions(list);
      setOpen(true);
      setActive(-1);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function choose(s: AddressSuggestion) {
    setOpen(false);
    setQuery(s.weergavenaam);
    const steps: Progress = [{ key: "adres", label: "Adres controleren", state: "running" }];
    setProgress([...steps]);

    const a = await getJson(`/api/adres/${encodeURIComponent(s.id)}`);
    const address = addressSchema.safeParse(a.body.address);
    if (!a.ok || !address.success) {
      steps[0] = {
        ...steps[0]!,
        state: "failed",
        detail: typeof a.body.error === "string" ? a.body.error : "Dit adres kunnen we nu niet ophalen.",
      };
      setProgress([...steps]);
      return;
    }
    steps[0] = { ...steps[0]!, state: "done", detail: address.data.weergavenaam };
    steps.push({ key: "bag", label: "Gebouwgegevens ophalen", state: "running" });
    setProgress([...steps]);
    update((p) => ({ ...p, address: address.data, building: null }));

    const params = new URLSearchParams();
    if (address.data.verblijfsobjectId) params.set("vbo", address.data.verblijfsobjectId);
    if (address.data.point) {
      params.set("lat", String(address.data.point.lat));
      params.set("lon", String(address.data.point.lon));
    }
    const b = await getJson(`/api/woning?${params}`);
    const building = buildingSchema.safeParse(b.body.building);
    if (b.ok && building.success) {
      steps[1] = { ...steps[1]!, state: "done" };
      const street = address.data.straat
        ? `${address.data.straat} ${address.data.huisnummer ?? ""}${address.data.huisletter ?? ""}`.trim()
        : null;
      update((p) => ({ ...p, building: building.data, name: p.name === "Mijn woning" && street ? street : p.name }));
    } else {
      steps[1] = {
        ...steps[1]!,
        state: "failed",
        detail: typeof b.body.error === "string" ? b.body.error : "Gebouwgegevens zijn nu niet beschikbaar. Je kunt gewoon verder.",
      };
    }
    steps.push({ key: "klaar", label: "Klaar om je plattegrond toe te voegen", state: "done" });
    setProgress([...steps]);
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
      void choose(suggestions[active]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const building = project.building;
  const vbo = building?.verblijfsobject;
  const pand = building?.pand;

  return (
    <section className="panel stack" aria-labelledby="stap-woning">
      <div className="panel-head">
        <div>
          <h2 id="stap-woning" tabIndex={-1}>
            Om welke woning gaat het?
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Typ je postcode en huisnummer of je straat en plaats, en kies je adres uit de lijst. Een adres is optioneel.
          </p>
        </div>
      </div>

      <div className="field combo">
        <label htmlFor="adres">Adres</label>
        <input
          ref={inputRef}
          id="adres"
          className="input"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="Bijvoorbeeld 1234AB 12"
          value={query}
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
                  void choose(s);
                }}
              >
                {s.weergavenaam}
              </li>
            ))}
          </ul>
        )}
        <span className="hint" aria-live="polite">
          {searching
            ? "Zoeken…"
            : (searchError ??
              `Je zoekopdracht gaat via onze server naar de ${SOURCES.locatieserver} van het Kadaster. We bewaren of loggen hem niet.`)}
        </span>
      </div>

      {progress && (
        <div className="card-flat" aria-live="polite">
          <h3>We zoeken je woning</h3>
          <ol className="progress-steps">
            {progress.map((p) => (
              <li key={p.key} data-state={p.state}>
                <span className="progress-dot" aria-hidden="true">
                  {p.state === "done" ? "✓" : p.state === "failed" ? "!" : ""}
                </span>
                <span>
                  {p.label}
                  <span className="visually-hidden">: {p.state === "done" ? "klaar" : p.state === "failed" ? "niet gelukt" : "bezig"}</span>
                  {p.detail ? <span className="small muted"> — {p.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {project.address && (
        <div className="grid-2">
          <div className="card-flat stack-sm">
            <h3 style={{ marginBottom: 4 }}>{project.address.weergavenaam}</h3>
            {building ? (
              <dl className="dl">
                <dt>Gebruiksoppervlakte (BAG)</dt>
                <dd>{vbo?.oppervlakteM2 != null ? formatM2(vbo.oppervlakteM2) : "Niet bekend"}</dd>
                {pand?.bouwjaar ? (
                  <>
                    <dt>Bouwjaar (BAG)</dt>
                    <dd>{pand.bouwjaar}</dd>
                  </>
                ) : null}
                {vbo?.gebruiksdoelen.length ? (
                  <>
                    <dt>Gebruiksdoel (BAG)</dt>
                    <dd>{vbo.gebruiksdoelen.join(", ")}</dd>
                  </>
                ) : null}
                {vbo?.status ? (
                  <>
                    <dt>Status (BAG)</dt>
                    <dd>{vbo.status}</dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <p className="small muted">Nog geen gebouwgegevens opgehaald.</p>
            )}
            <p className="notice small" style={{ marginTop: 8 }}>
              De officiële gebruiksoppervlakte geldt voor de hele woning en wordt anders gemeten dan de vloer per kamer. Hij bepaalt dus
              niet de oppervlakte van je kamers; die halen we uit je plattegrond.
            </p>
            {building?.notes.length ? (
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                {building.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            <p className="tiny muted" style={{ margin: 0 }}>
              Bron: {SOURCES.bag}
              {building ? `, opgehaald ${new Date(building.fetchedAt).toLocaleDateString("nl-NL")}` : ""}.
            </p>
            <label className="check small">
              <input
                type="checkbox"
                checked={project.report.includeAddress}
                onChange={(e) => update((p) => ({ ...p, report: { ...p.report, includeAddress: e.target.checked } }))}
              />
              <span>Zet mijn adres in het rapport (standaard uit)</span>
            </label>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ justifySelf: "start" }}
              onClick={() => update((p) => ({ ...p, address: null, building: null, report: { ...p.report, includeAddress: false } }))}
            >
              Adres verwijderen
            </button>
          </div>
          {pand?.outline ? (
            <div className="card-flat">
              <BuildingOutline outline={pand.outline} point={project.address.point} />
            </div>
          ) : null}
        </div>
      )}

      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => goTo("plattegrond")}>
          {project.address ? "Verder naar plattegrond" : "Zonder adres verder"}
        </button>
      </div>
    </section>
  );
}
