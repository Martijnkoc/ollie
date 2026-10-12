import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/Empty";
import { requireCommunity } from "@/lib/access";
import { searchMembers } from "@/lib/community/directory";
import { INTENTS, REGIONS, label } from "@/lib/config";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Leden", robots: { index: false } };

export default async function MembersPage(props: PageProps<"/cafe/leden">) {
  const v = await requireCommunity("/cafe/leden");
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q.slice(0, 60) : "";
  const members = await searchMembers(await getDb(), v, query);
  return (
    <div className="stack-lg">
      <div>
        <h1>Leden</h1>
        <p className="muted">Je ziet alleen wat leden zelf zichtbaar hebben gemaakt.</p>
      </div>
      <form role="search" className="row" action="/cafe/leden">
        <label htmlFor="q" className="visually-hidden">
          Zoek op naam, regio of interesse
        </label>
        <input
          id="q"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Zoek op naam, regio of interesse"
          style={{ flex: "1 1 240px" }}
        />
        <button type="submit" className="btn secondary">
          Zoeken
        </button>
      </form>
      {members.length === 0 ? (
        <Empty title={query ? "Niemand gevonden" : "Nog niemand te zien"}>
          <p>{query ? "Probeer een andere zoekterm." : "Zodra er leden vindbaar zijn, zie je ze hier."}</p>
        </Empty>
      ) : (
        <ul className="list grid-2" aria-label="Zoekresultaten">
          {members.map((m) => (
            <li key={m.id}>
              <Link href={`/cafe/leden/${m.id}`} className="card flat card-link person">
                <span className="avatar" aria-hidden>
                  {m.alias.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <strong>
                    {m.alias}
                    {m.age !== null ? `, ${m.age}` : ""}
                  </strong>
                  <span className="muted small" style={{ display: "block" }}>
                    {[m.region ? label(REGIONS, m.region) : null, label(INTENTS, m.intent)].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
