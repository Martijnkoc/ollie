import { NavLink } from "@/components/NavLink";
import { requireStaff } from "@/lib/access";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const v = await requireStaff();
  return (
    <div className="container app-shell">
      <nav className="side-nav" aria-label="Beheer">
        <ul>
          <li>
            <NavLink href="/beheer">Overzicht</NavLink>
          </li>
          <li>
            <NavLink href="/beheer/meldingen">Meldingen</NavLink>
          </li>
          <li>
            <NavLink href="/beheer/klachten">Klachten</NavLink>
          </li>
          <li>
            <NavLink href="/beheer/bezwaren">Bezwaren</NavLink>
          </li>
          {v.roles.includes("admin") && (
            <li>
              <NavLink href="/beheer/rollen">Rollen</NavLink>
            </li>
          )}
        </ul>
      </nav>
      <div className="stack-lg" style={{ minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
