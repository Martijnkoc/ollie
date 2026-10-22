import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/Empty";
import { DecideAppeal } from "@/components/forms/ModerationForms";
import { requireStaff } from "@/lib/access";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Bezwaren", robots: { index: false } };

export default async function AppealsPage() {
  await requireStaff();
  const rows = await (
    await getDb()
  ).query<{ id: string; user_id: string; name: string | null; body: string; created_at: Date; reason: string | null }>(
    `select a.id, a.user_id, p.display_name as name, a.body, a.created_at, u.restricted_reason as reason
     from appeals a join users u on u.id = a.user_id left join profiles p on p.user_id = a.user_id where a.status = 'open' order by a.created_at`,
  );
  return (
    <>
      <h1>Bezwaren</h1>
      {rows.length === 0 ? (
        <Empty title="Geen open bezwaren" />
      ) : (
        <ul className="list">
          {rows.map((a) => (
            <li key={a.id} className="card stack">
              <p className="small muted" style={{ margin: 0 }}>
                <Link href={`/beheer/gebruikers/${a.user_id}`}>{a.name ?? "Gebruiker"}</Link> · {formatDateTime(a.created_at)}
              </p>
              <p className="small" style={{ margin: 0 }}>
                <strong>Reden van beperking:</strong> {a.reason}
              </p>
              <blockquote className="card tight pre" style={{ margin: 0 }}>
                {a.body}
              </blockquote>
              <DecideAppeal appealId={a.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
