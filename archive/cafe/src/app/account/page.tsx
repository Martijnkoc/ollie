import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { unblockAction } from "@/app/actions/community";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteAccountForm } from "@/components/forms/AccountForms";
import { ProfileForm } from "@/components/forms/ProfileForm";
import { viewer } from "@/lib/access";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const v = await viewer();
  if (!v) redirect("/inloggen?next=/account");
  const blocked = await (
    await getDb()
  ).query<{ id: string; alias: string | null }>(
    `select b.blocked_id as id, p.alias from blocks b left join profiles p on p.user_id = b.blocked_id where b.blocker_id = $1`,
    [v.user.id],
  );

  return (
    <div className="container narrow page stack-lg">
      <div className="row between">
        <div>
          <h1 style={{ margin: 0 }}>Account</h1>
          <p className="muted" style={{ margin: 0 }}>
            Ingelogd als {v.user.email}
          </p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="btn secondary">
            Uitloggen
          </button>
        </form>
      </div>

      {v.restricted && (
        <p className="notice error">
          Je account is beperkt. <Link href="/beperkt">Lees waarom en maak bezwaar</Link>
        </p>
      )}

      <section className="stack" aria-labelledby="profiel">
        <h2 id="profiel">Profiel</h2>
        {v.profile ? (
          <ProfileForm
            mode="edit"
            next="/account"
            defaults={{
              alias: v.profile.alias,
              region: v.profile.region,
              intent: v.profile.intent,
              interests: v.profile.interests,
              bio: v.profile.bio,
              showAge: v.profile.show_age,
              showRegion: v.profile.show_region,
              listed: v.profile.listed,
            }}
          />
        ) : (
          <p className="notice">
            Je hebt nog geen communityprofiel. Een uitnodiging aannemen kan ook zonder.{" "}
            <Link href="/welkom?next=/lidmaatschap">Profiel maken</Link>
          </p>
        )}
      </section>

      <section className="stack" aria-labelledby="lid">
        <h2 id="lid">Lidmaatschap</h2>
        <Link href="/lidmaatschap">Status, tegoed, betaalgegevens en opzeggen</Link>
      </section>

      <section className="stack" aria-labelledby="geblokkeerd">
        <h2 id="geblokkeerd">Geblokkeerd</h2>
        {blocked.length === 0 ? (
          <p className="muted">Je hebt niemand geblokkeerd.</p>
        ) : (
          <ul className="list">
            {blocked.map((b) => (
              <li key={b.id} className="card flat row between">
                <span>{b.alias ?? "Gast"}</span>
                <ActionForm action={unblockAction.bind(null, b.id)}>
                  <SubmitButton className="btn ghost small">Deblokkeren</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack" aria-labelledby="verwijderen">
        <h2 id="verwijderen">Account verwijderen</h2>
        <p className="muted">
          We verwijderen je account, profiel, berichten, feedback en gedeelde contactgegevens, en stoppen een lopend abonnement direct.
          Geplande videodates worden afgezegd. Meldingen die je over anderen deed, bewaren we zonder jouw naam voor moderatie. Lees meer in
          de <Link href="/privacy">privacyverklaring</Link>.
        </p>
        <details>
          <summary>Ik wil mijn account verwijderen</summary>
          <DeleteAccountForm />
        </details>
      </section>
    </div>
  );
}
