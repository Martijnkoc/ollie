import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/Empty";
import { FeedGrid } from "@/components/Tiles";
import { viewer } from "@/lib/access";
import { CATEGORIES, REGIONS, categoryLabel, label } from "@/lib/config";
import { getDb } from "@/lib/db";
import { feed, parseFeedQuery } from "@/lib/feed";
import { savedIds } from "@/lib/social";

export const metadata: Metadata = {
  title: "Ontdek talent",
  description: "Ontdek makers, hun werk en diensten met vaste prijzen of op aanvraag. Zoek op talent, categorie en provincie.",
};

const KINDS = [
  { key: "", label: "Alles" },
  { key: "diensten", label: "Diensten" },
  { key: "werk", label: "Werk" },
  { key: "makers", label: "Makers" },
];

export default async function DiscoverPage(props: PageProps<"/ontdek">) {
  const sp = await props.searchParams;
  const query = parseFeedQuery(sp);
  const v = await viewer();
  const db = await getDb();
  const [{ items, next }, saved] = await Promise.all([feed(db, query, v?.user.id), savedIds(db, v?.user.id)]);

  const params = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, val] of Object.entries(sp)) if (typeof val === "string" && val && k !== "voor") p.set(k, val);
    for (const [k, val] of Object.entries(over)) {
      if (val) p.set(k, val);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/ontdek?${s}` : "/ontdek";
  };
  const kind = typeof sp.soort === "string" ? sp.soort : "";
  const heading = query.category ? categoryLabel(query.category) : query.q ? `Zoekresultaten voor "${query.q}"` : "Ontdek talent";
  const filtered = Boolean(
    query.q || query.category || query.region || query.remote || query.booking || query.maxPriceCents || query.following,
  );

  return (
    <div className="container page stack-lg">
      <div className="stack">
        <p className="eyebrow">{query.following ? "Van makers die je volgt" : "Ontdek"}</p>
        <h1 style={{ margin: 0 }}>{heading}</h1>
        {query.category && <p className="lead">{CATEGORIES.find((c) => c.key === query.category)?.blurb}</p>}
      </div>

      <form action="/ontdek" role="search" className="stack card tight" aria-label="Zoeken en filteren">
        {kind && <input type="hidden" name="soort" value={kind} />}
        {query.following && <input type="hidden" name="volgend" value="1" />}
        <div className="filters">
          <div className="field">
            <label className="label" htmlFor="f-q">
              Zoek
            </label>
            <input id="f-q" type="search" name="q" defaultValue={query.q} placeholder="Bijv. bruiloftsfotograaf, webshop, schilder" />
          </div>
          <div className="field">
            <label className="label" htmlFor="f-cat">
              Categorie
            </label>
            <select id="f-cat" name="categorie" defaultValue={query.category ?? ""}>
              <option value="">Alle categorieën</option>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="f-regio">
              Provincie
            </label>
            <select id="f-regio" name="regio" defaultValue={query.region ?? ""}>
              <option value="">Heel Nederland</option>
              {REGIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="f-max">
              Maximale prijs (€)
            </label>
            <input
              id="f-max"
              type="number"
              name="max"
              min={5}
              step={5}
              inputMode="numeric"
              defaultValue={query.maxPriceCents ? query.maxPriceCents / 100 : ""}
            />
          </div>
          <button type="submit" className="btn">
            Zoeken
          </button>
        </div>
        <div className="filter-toggles">
          <label className="check">
            <input type="checkbox" name="afstand" value="1" defaultChecked={query.remote} />
            <span>{query.region ? "Ook makers die op afstand werken" : "Alleen op afstand"}</span>
          </label>
          <fieldset className="row tight" style={{ gap: 16 }}>
            <legend className="visually-hidden">Manier van boeken</legend>
            <label className="check">
              <input type="radio" name="boeken" value="" defaultChecked={!query.booking} />
              <span>Alle diensten</span>
            </label>
            <label className="check">
              <input type="radio" name="boeken" value="direct" defaultChecked={query.booking === "direct"} />
              <span>Direct te boeken</span>
            </label>
            <label className="check">
              <input type="radio" name="boeken" value="overleg" defaultChecked={query.booking === "overleg"} />
              <span>Op aanvraag</span>
            </label>
          </fieldset>
        </div>
      </form>

      <div className="row between">
        <nav className="chips scroll" aria-label="Soort">
          {KINDS.map((k) => (
            <Link
              key={k.key}
              href={params({ soort: k.key || undefined })}
              className="chip"
              aria-current={kind === k.key ? "true" : undefined}
            >
              {k.label}
            </Link>
          ))}
          {v?.profile && (
            <Link
              href={params({ volgend: query.following ? undefined : "1" })}
              className="chip"
              aria-current={query.following ? "true" : undefined}
            >
              Volgend
            </Link>
          )}
        </nav>
        {filtered && (
          <Link href={kind ? `/ontdek?soort=${kind}` : "/ontdek"} className="small">
            Filters wissen
          </Link>
        )}
      </div>

      <nav className="chips scroll" aria-label="Categorieën">
        {CATEGORIES.map((c) => (
          <Link
            key={c.key}
            href={params({ categorie: query.category === c.key ? undefined : c.key })}
            className="chip"
            aria-current={query.category === c.key ? "true" : undefined}
          >
            {c.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <Empty title={filtered ? "Niets gevonden met deze filters" : "Nog niets te ontdekken"}>
          <p>
            {query.following
              ? "Makers die je volgt hebben nog niets gepubliceerd, of je volgt nog niemand."
              : filtered
                ? `Probeer een andere zoekterm${query.region ? ` of zoek buiten ${label(REGIONS, query.region)}` : ""}.`
                : "Sell Yourself is net begonnen. Zodra makers hun werk en diensten publiceren, zie je ze hier."}
          </p>
          {filtered ? (
            <Link href="/ontdek" className="btn secondary">
              Alles bekijken
            </Link>
          ) : (
            <Link href="/inloggen?next=%2Fwelkom%3Fverkopen%3D1" className="btn">
              Zet als eerste je talent online
            </Link>
          )}
        </Empty>
      ) : (
        <FeedGrid items={items} ctx={{ saved, loggedIn: Boolean(v?.profile) }} />
      )}

      {next && (
        <div className="row" style={{ justifyContent: "center" }}>
          <Link
            href={`${params({})}${params({}).includes("?") ? "&" : "?"}voor=${encodeURIComponent(next.toISOString())}`}
            className="btn secondary"
          >
            Meer laden
          </Link>
        </div>
      )}

      <details className="why">
        <summary>Waarom zie ik dit in deze volgorde?</summary>
        <p style={{ marginTop: 8 }}>
          Nieuwste eerst, gefilterd op wat jij kiest. Met &lsquo;Volgend&rsquo; zie je alleen makers die je volgt. Er is geen betaalde
          promotie en geen populariteitsscore. Komt er ooit betaalde promotie, dan staat er duidelijk &lsquo;Gesponsord&rsquo; bij.
        </p>
      </details>
    </div>
  );
}
