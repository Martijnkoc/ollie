import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { unblockAction } from "@/app/actions/social";
import { ActionForm } from "@/components/ActionForm";
import { DeleteAccountForm } from "@/components/forms/AccountForms";
import { SubmitButton } from "@/components/SubmitButton";
import { viewer } from "@/lib/access";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const v = await viewer();
  if (!v) redirect("/inloggen?next=/account");
  const blocked = await (
    await getDb()
  ).query<{ id: string; name: string | null }>(
    `select b.blocked_id as id, p.display_name as name from blocks b left join profiles p on p.user_id = b.blocked_id where b.blocker_id = $1`,
    [v.user.id],
  );
  return (
    <div className="container narrow page stack-lg">
      <div className="row between">
        <div>
          <p className="eyebrow">Account</p>
          <h1 style={{ margin: 0 }}>Instellingen</h1>
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
        <h2 id="profiel" style={{ fontSize: "1.3rem" }}>
          Profiel en verkopen
        </h2>
        {v.profile ? (
          <div className="row">
            <Link href="/dashboard/profiel" className="btn secondary">
              Profiel bewerken
            </Link>
            <Link href="/dashboard/uitbetalingen" className="btn secondary">
              Uitbetalingen
            </Link>
          </div>
        ) : (
          <Link href="/welkom" className="btn">
            Profiel aanmaken
          </Link>
        )}
        <p className="small muted">Kopen en verkopen doe je met hetzelfde account. Je e-mailadres is nooit zichtbaar voor anderen.</p>
      </section>

      <section className="stack" aria-labelledby="geblokkeerd">
        <h2 id="geblokkeerd" style={{ fontSize: "1.3rem" }}>
          Geblokkeerd
        </h2>
        {blocked.length === 0 ? (
          <p className="muted">Je hebt niemand geblokkeerd.</p>
        ) : (
          <ul className="list">
            {blocked.map((b) => (
              <li key={b.id} className="card tight row between">
                <span>{b.name ?? "Voormalig lid"}</span>
                <ActionForm action={unblockAction.bind(null, b.id)}>
                  <SubmitButton className="btn ghost small">Deblokkeren</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack" aria-labelledby="verwijderen">
        <h2 id="verwijderen" style={{ fontSize: "1.3rem" }}>
          Account verwijderen
        </h2>
        <p className="muted">
          We verwijderen je account, profiel, diensten, portfolio en bestanden, berichten, volgers en bewaarde items. Afgeronde opdrachten
          blijven voor de administratie van de andere partij bewaard, zonder koppeling aan jou; reviews die je schreef blijven staan zonder
          je naam. Heb je nog betaalde opdrachten lopen, rond die dan eerst af. Lees meer in de{" "}
          <Link href="/privacy">privacyverklaring</Link>.
        </p>
        <details>
          <summary>Ik wil mijn account verwijderen</summary>
          <DeleteAccountForm />
        </details>
      </section>
    </div>
  );
}
