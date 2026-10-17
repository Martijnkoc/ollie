import type { CompetitionListItem } from "@/lib/football/queries";
import { competitionPath } from "@/lib/slug";
import { FavoritesSide } from "./FavoritesSide";
import { NavLink } from "./NavLink";

export function CompetitionNav({ competitions }: { competitions: CompetitionListItem[] }) {
  const available = competitions.filter((c) => c.availability === "available");
  return (
    <nav aria-label="Competities">
      <div className="side-title">Competities</div>
      <ul className="side-list">
        {available.map((c) => (
          <li key={c.id}>
            <NavLink href={competitionPath(c.slug)}>
              <span>{c.name}</span>
              <span className="count">{c.country}</span>
            </NavLink>
          </li>
        ))}
        {available.length === 0 && <li className="side-empty dim">Nog geen competities beschikbaar</li>}
        <li className="side-optional">
          <NavLink href="/competities" exact>
            <span className="dim">Alle competities</span>
          </NavLink>
        </li>
      </ul>
      <div className="side-optional">
        <FavoritesSide competitions={available.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />
      </div>
    </nav>
  );
}
