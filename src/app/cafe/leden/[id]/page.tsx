import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sendRequestAction } from "@/app/actions/community";
import { BlockConfirm } from "@/components/BlockConfirm";
import { ActionForm } from "@/components/ActionForm";
import { Dialog } from "@/components/Dialog";
import { Field } from "@/components/Field";
import { ReportForm } from "@/components/forms/ReportForm";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCommunity } from "@/lib/access";
import { threadBetween } from "@/lib/community/contacts";
import { memberProfile } from "@/lib/community/directory";
import { INTENTS, REGIONS, label } from "@/lib/config";
import { getDb, one } from "@/lib/db";

export const metadata: Metadata = { title: "Profiel", robots: { index: false } };

export default async function MemberPage(props: PageProps<"/cafe/leden/[id]">) {
  const { id } = await props.params;
  const v = await requireCommunity(`/cafe/leden/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const p = await memberProfile(db, v, id);
  if (!p) notFound();
  const self = id === v.user.id;
  const thread = self ? undefined : await threadBetween(db, v.user.id, id);
  const pending = self
    ? undefined
    : await one<{ id: string }>(db, `select id from contact_requests where status = 'pending' and from_id = $1 and to_id = $2`, [
        v.user.id,
        id,
      ]);

  return (
    <div className="stack-lg">
      <div className="card stack">
        <div className="person">
          <span className="avatar large" aria-hidden>
            {p.alias.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h1 style={{ margin: 0 }}>
              {p.alias}
              {p.age !== null ? `, ${p.age}` : ""}
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              {[p.region ? label(REGIONS, p.region) : null, label(INTENTS, p.intent)].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        {p.bio && <p className="quote">&ldquo;{p.bio}&rdquo;</p>}
        {p.interests.length > 0 && (
          <ul className="tags" aria-label="Interesses">
            {p.interests.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </div>

      {self ? (
        <p className="notice">
          Zo zien andere leden je profiel. <Link href="/account">Profiel aanpassen</Link>
        </p>
      ) : thread ? (
        <Link className="btn" href={`/berichten/${thread.id}`}>
          Naar jullie gesprek
        </Link>
      ) : pending ? (
        <p className="notice lime">Je verzoek is verstuurd. Je kunt pas privé chatten als {p.alias} het accepteert.</p>
      ) : (
        <div className="card flat stack">
          <h2>Privé kennismaken</h2>
          <p className="muted">Stuur een verzoek. Pas als {p.alias} accepteert, kunnen jullie privé chatten en een videodate plannen.</p>
          <ActionForm action={sendRequestAction.bind(null, id)} className="stack">
            <Field id="request-message" label="Een kort berichtje (optioneel)">
              <textarea name="message" maxLength={280} placeholder="Bijvoorbeeld waarom je graag wilt kennismaken." />
            </Field>
            <SubmitButton>Verzoek sturen</SubmitButton>
          </ActionForm>
        </div>
      )}

      {!self && (
        <div className="row">
          <Dialog trigger="Melden" triggerClassName="btn ghost" title={`${p.alias} melden`}>
            <ReportForm context="profile" contextId={id} name={p.alias} />
          </Dialog>
          <Dialog trigger="Blokkeren" triggerClassName="btn ghost" title={`${p.alias} blokkeren?`}>
            <BlockConfirm userId={id} name={p.alias} back="/cafe/leden" />
          </Dialog>
        </div>
      )}
    </div>
  );
}
