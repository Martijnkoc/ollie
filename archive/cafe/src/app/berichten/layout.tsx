import { NavLink } from "@/components/NavLink";
import { requireCommunity } from "@/lib/access";

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  await requireCommunity("/berichten");
  return (
    <div className="container app-shell">
      <nav className="side-nav" aria-label="Cafe">
        <ul>
          <li>
            <NavLink href="/cafe/lounge">Terug naar Cafe</NavLink>
          </li>
          <li>
            <NavLink href="/berichten">Privéberichten</NavLink>
          </li>
          <li>
            <NavLink href="/cafe/leden">Leden zoeken</NavLink>
          </li>
        </ul>
      </nav>
      <div>{children}</div>
    </div>
  );
}
