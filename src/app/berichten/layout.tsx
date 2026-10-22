import Link from "next/link";
import { Avatar } from "@/components/Visuals";
import { requireActive } from "@/lib/access";
import { getDb } from "@/lib/db";
import { ago } from "@/lib/format";
import { threadsFor } from "@/lib/messages";
import { InboxLink } from "./InboxLink";

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const v = await requireActive("/berichten");
  const threads = await threadsFor(await getDb(), v);
  return (
    <div className="container page stack">
      <h1 style={{ margin: 0 }}>Berichten</h1>
      <div className="inbox">
        <nav className="inbox-list" aria-label="Gesprekken">
          {threads.length === 0 ? (
            <p className="muted small" style={{ padding: 16 }}>
              Nog geen gesprekken. Stuur een maker een bericht vanaf hun profiel of dienst. <Link href="/ontdek">Ontdek talent</Link>
            </p>
          ) : (
            threads.map((t) => (
              <InboxLink key={t.id} href={`/berichten/${t.id}`}>
                <Avatar name={t.other_name} url={t.other_avatar} />
                <span className="who">
                  {t.other_name}
                  {t.unread > 0 && (
                    <span className="count-dot" aria-label={`${t.unread} ongelezen`}>
                      {t.unread}
                    </span>
                  )}
                </span>
                <span className="when">{ago(t.last_at)}</span>
                <span className="preview">{t.blocked ? "Geblokkeerd" : (t.last_body ?? "")}</span>
              </InboxLink>
            ))
          )}
        </nav>
        <div>{children}</div>
      </div>
    </div>
  );
}
