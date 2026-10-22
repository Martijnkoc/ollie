import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/Empty";
import { DecideAppeal } from "@/components/forms/ModerationForms";
import { requireStaff } from "@/lib/access";
import { getDb } from "@/lib/db";
import { formatShort } from "@/lib/time";

export const metadata: Metadata = { title: "Bezwaren", robots: { index: false } };

export default async function AppealsPage() {
  await requireStaff();
  const appeals = await (
    await getDb()
  ).query<{ id: string; user_id: string; alias: string | null; body: string; status: string; created_at: Date; reason: string | null }>(
    `select a.id, a.user_id, p.alias, a.body, a.status, a.created_at, u.restricted_reason as reason
     from appeals a join users u on u.id = a.user_id left join profiles p on p.user_id = a.user_id
     order by (a.status = 'open') desc, a.created_at desc limit 100`,
  );
  return (
    <>
      <h1>Bezwaren</h1>
      {appeals.length === 0 ? (
        <Empty title="Geen bezwaren" />
      ) : (
        <ul className="list">
          {appeals.map((a) => (
            <li key={a.id} className="card flat stack">
              <p className="small muted" style={{ margin: 0 }}>
                <Link href={`/beheer/gebruikers/${a.user_id}`}>{a.alias ?? "Account zonder profiel"}</Link> · {formatShort(a.created_at)}
              </p>
              {a.reason && <p className="small">Beperkt wegens: {a.reason}</p>}
              <blockquote className="card soft" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {a.body}
              </blockquote>
              {a.status === "open" ? (
                <DecideAppeal appealId={a.id} />
              ) : (
                <span className="badge">{a.status === "granted" ? "Toegekend" : "Afgewezen"}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
