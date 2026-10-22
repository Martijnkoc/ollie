import { NavLink } from "@/components/NavLink";
import { requireActive } from "@/lib/access";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const v = await requireActive("/dashboard");
  return (
    <div className="container app-shell">
      <nav className="side-nav" aria-label="Dashboard">
        <ul>
          <li>
            <NavLink href="/dashboard">Overzicht</NavLink>
          </li>
          <li>
            <NavLink href="/dashboard/profiel">Profiel</NavLink>
          </li>
          <li>
            <NavLink href="/dashboard/diensten">Diensten</NavLink>
          </li>
          <li>
            <NavLink href="/dashboard/portfolio">Portfolio</NavLink>
          </li>
          <li>
            <NavLink href="/dashboard/uitbetalingen">Uitbetalingen</NavLink>
          </li>
          <li>
            <NavLink href="/bewaard">Bewaard &amp; volgend</NavLink>
          </li>
          <li>
            <NavLink href={`/@${v.profile.username}`}>Bekijk profiel</NavLink>
          </li>
          <li>
            <NavLink href="/account">Account</NavLink>
          </li>
        </ul>
      </nav>
      <div className="stack-lg" style={{ minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
