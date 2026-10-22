import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FeatureForm, HideForm, LiftForm, RestrictForm } from "@/components/forms/ModerationForms";
import { profileOf, requireStaff } from "@/lib/access";
import { getDb, one } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { isUuid } from "@/lib/tokens";

export const metadata: Metadata = { title: "Gebruiker", robots: { index: false } };

export default async function StaffUser(props: PageProps<"/beheer/gebruikers/[id]">) {
  await requireStaff();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const user = await one<{ id: string; email: string; created_at: Date; restricted_at: Date | null; restricted_reason: string | null }>(
    db,
    `select id, email, created_at, restricted_at, restricted_reason from users where id = $1`,
    [id],
  );
  if (!user) notFound();
  const profile = await profileOf(db, id);
  const featured = await one<{ featured_at: Date | null }>(db, `select featured_at from profiles where user_id = $1`, [id]);
  const log = await db.query<{ action: string; reason: string; created_at: Date; actor: string | null }>(
    `select m.action, m.reason, m.created_at, p.display_name as actor from moderation_actions m left join profiles p on p.user_id = m.actor_id
     where m.target_id = $1 order by m.created_at desc limit 50`,
    [id],
  );
  const reports = await one<{ n: number }>(db, `select count(*)::int as n from reports where target_id = $1`, [id]);
  return (
    <>
      <div>
        <h1 style={{ marginBottom: 4 }}>{profile?.display_name ?? "Geen profiel"}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {profile && <Link href={`/@${profile.username}`}>@{profile.username}</Link>} · account sinds {formatDateTime(user.created_at)} ·{" "}
          {reports?.n ?? 0} meldingen
        </p>
      </div>
      {user.restricted_at ? (
        <section className="card stack">
          <p className="notice error" style={{ margin: 0 }}>
            Beperkt sinds {formatDateTime(user.restricted_at)}: {user.restricted_reason}
          </p>
          <LiftForm userId={id} />
        </section>
      ) : (
        <section className="card stack">
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Account beperken</h2>
          <RestrictForm userId={id} />
        </section>
      )}
      {profile && (
        <section className="card stack">
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Profiel</h2>
          {profile.published && !profile.hidden_at && <FeatureForm userId={id} featured={Boolean(featured?.featured_at)} />}
          {profile.hidden_at ? (
            <>
              <p className="notice warn small" style={{ margin: 0 }}>
                Verborgen: {profile.hidden_reason}
              </p>
              <HideForm context="profile" id={id} hide={false} />
            </>
          ) : (
            <details>
              <summary className="small">Profiel verbergen</summary>
              <HideForm context="profile" id={id} hide />
            </details>
          )}
        </section>
      )}
      <section className="stack">
        <h2 style={{ fontSize: "1.1rem" }}>Logboek</h2>
        {log.length === 0 ? (
          <p className="muted">Nog geen acties.</p>
        ) : (
          <ul className="divided small">
            {log.map((l, i) => (
              <li key={i}>
                <strong>{l.action}</strong> · {formatDateTime(l.created_at)} · {l.actor ?? "systeem"}
                <br />
                <span className="muted">{l.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
