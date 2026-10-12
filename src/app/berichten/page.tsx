import type { Metadata } from "next";
import Link from "next/link";
import { respondRequestAction, withdrawRequestAction } from "@/app/actions/community";
import { ActionForm } from "@/components/ActionForm";
import { Empty } from "@/components/Empty";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCommunity } from "@/lib/access";
import { requestsFor, threadsFor } from "@/lib/community/contacts";
import { getDb } from "@/lib/db";
import { formatShort } from "@/lib/time";

export const metadata: Metadata = { title: "Privéberichten", robots: { index: false } };

export default async function MessagesPage() {
  const v = await requireCommunity("/berichten");
  const db = await getDb();
  const [requests, threads] = await Promise.all([requestsFor(db, v), threadsFor(db, v)]);
  const incoming = requests.filter((r) => r.incoming);
  const outgoing = requests.filter((r) => !r.incoming);

  return (
    <div className="stack-lg">
      <h1>Privéberichten</h1>

      {incoming.length > 0 && (
        <section className="stack" aria-labelledby="verzoeken">
          <h2 id="verzoeken">Verzoeken voor jou</h2>
          <ul className="list">
            {incoming.map((r) => (
              <li key={r.id} className="card flat stack">
                <p style={{ margin: 0 }}>
                  <Link href={`/cafe/leden/${r.from_id}`}>
                    <strong>{r.alias}</strong>
                  </Link>{" "}
                  wil privé met je kennismaken.
                </p>
                {r.message && (
                  <p className="quote" style={{ margin: 0 }}>
                    &ldquo;{r.message}&rdquo;
                  </p>
                )}
                <div className="row">
                  <ActionForm action={respondRequestAction.bind(null, r.id, true)}>
                    <SubmitButton>Accepteren</SubmitButton>
                  </ActionForm>
                  <ActionForm action={respondRequestAction.bind(null, r.id, false)}>
                    <SubmitButton className="btn secondary">Liever niet</SubmitButton>
                  </ActionForm>
                </div>
                <p className="hint" style={{ margin: 0 }}>
                  &lsquo;Liever niet&rsquo; meldt niets aan de ander; het verzoek verdwijnt gewoon.
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="stack" aria-labelledby="gesprekken">
        <h2 id="gesprekken">Gesprekken</h2>
        {threads.length === 0 ? (
          <Empty title="Nog geen privégesprekken">
            <p>Zie je iemand in de lounge of aan een tafel met wie je verder wilt praten? Open het profiel en stuur een verzoek.</p>
          </Empty>
        ) : (
          <ul className="list">
            {threads.map((t) => (
              <li key={t.id}>
                <Link href={`/berichten/${t.id}`} className="card flat card-link row between">
                  <span className="person">
                    <span className="avatar" aria-hidden>
                      {t.other_alias.slice(0, 1).toUpperCase()}
                    </span>
                    <strong>{t.other_alias}</strong>
                  </span>
                  <span className="muted small">{t.blocked ? "Geblokkeerd" : t.last_at ? formatShort(t.last_at) : "Nieuw"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section className="stack" aria-labelledby="verstuurd">
          <h2 id="verstuurd">Door jou verstuurd</h2>
          <ul className="list">
            {outgoing.map((r) => (
              <li key={r.id} className="card flat row between">
                <span>
                  Wacht op <strong>{r.alias}</strong>
                </span>
                <ActionForm action={withdrawRequestAction.bind(null, r.id)}>
                  <SubmitButton className="btn ghost small">Intrekken</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
