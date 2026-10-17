import { NavLink } from "./NavLink";
import { SearchBox } from "./SearchBox";
import { Wordmark } from "./Wordmark";

export function SiteHeader({ searchable }: { searchable: boolean }) {
  return (
    <header className="site-header">
      <div className="container">
        <Wordmark />
        <nav className="site-nav" aria-label="Hoofdmenu">
          <NavLink href="/" exact>
            Vandaag
          </NavLink>
          <NavLink href="/competities">Competities</NavLink>
          <NavLink href="/favorieten">Favorieten</NavLink>
        </nav>
        {searchable && (
          <div className="header-search">
            <SearchBox />
          </div>
        )}
      </div>
    </header>
  );
}
