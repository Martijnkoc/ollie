import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiftForm, RestrictForm } from "@/components/forms/ModerationForms";
import { requireStaff } from "@/lib/access";
import { getDb, one } from "@/lib/db";
import { formatShort } from "@/lib/time";

export const metadata: Metadata = { title: "Gebruiker", robots: { index: false } };

export default async function StaffUserPage(props: PageProps<"/beheer/gebruikers/[id]">) {
  await requireStaff();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const user = await one<{
    id: string;
    created_at: Date;
    restricted_at: Date | null;
    restricted_reason: string | null;
    alias: string | null;
  }>(
    db,
    `select u.id, u.created_at, u.restricted_at, u.restricted_reason, p.alias from users u left join profiles p on p.user_id = u.id where u.id = $1`,
    [id],
  );
  if (!user) notFound();
  const actions = await db.query<{ action: string; reason: string; created_at: Date; actor: string | null }>(
    `select a.action, a.reason, a.created_at, p.alias as actor from moderation_actions a left join profiles p on p.user_id = a.actor_id
     where a.target_id = $1 order by a.created_at desc`,
    [id],
  );
  const reports = await one<{ n: number }>(db, `select count(*)::int as n from reports where target_id = $1`, [id]);

  return (
    <>
      <h1>{user.alias ?? "Account zonder profiel"}</h1>
      <p className="muted">
        Account sinds {formatShort(user.created_at)} · {reports?.n ?? 0} meldingen. E-mailadres en feedback tonen we hier niet.
      </p>
      <div className="card flat stack">
        {user.restricted_at ? (
          <>
            <p className="notice error">
              Beperkt sinds {formatShort(user.restricted_at)}: {user.restricted_reason}
            </p>
            <LiftForm userId={id} />
          </>
        ) : (
          <RestrictForm userId={id} />
        )}
      </div>
      <section className="stack">
        <h2>Logboek</h2>
        {actions.length === 0 ? (
          <p className="muted">Nog geen maatregelen.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wanneer</th>
                  <th>Actie</th>
                  <th>Door</th>
                  <th>Reden</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a, i) => (
                  <tr key={i}>
                    <td>{formatShort(a.created_at)}</td>
                    <td>{a.action}</td>
                    <td>{a.actor ?? "–"}</td>
                    <td>{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
