import { NavLink } from "@/components/NavLink";
import { requireCommunity } from "@/lib/access";
import { listChannels } from "@/lib/community/channels";
import { getDb } from "@/lib/db";

export default async function CafeLayout({ children }: { children: React.ReactNode }) {
  await requireCommunity("/cafe/lounge");
  const channels = await listChannels(await getDb());
  return (
    <div className="container app-shell">
      <nav className="side-nav" aria-label="Cafe">
        <div className="groups">
          <div>
            <h2>Gesprekken</h2>
            <ul>
              {channels.map((c) => (
                <li key={c.id}>
                  <NavLink href={`/cafe/${c.slug}`}>{c.name}</NavLink>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Mensen</h2>
            <ul>
              <li>
                <NavLink href="/cafe/leden">Leden zoeken</NavLink>
              </li>
              <li>
                <NavLink href="/berichten">Privéberichten</NavLink>
              </li>
            </ul>
          </div>
        </div>
      </nav>
      <div>{children}</div>
    </div>
  );
}
