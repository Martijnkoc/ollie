import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  acceptAlternativeAction,
  addMomentAction,
  cancelInviteAction,
  declineAlternativeAction,
} from "@/app/actions/invite";
import { ActionForm } from "@/components/ActionForm";
import { CopyLink } from "@/components/CopyLink";
import { SubmitButton } from "@/components/SubmitButton";
import { DATE_MINUTES, MAX_PROPOSED_MOMENTS, MIN_LEAD_MINUTES } from "@/lib/config";
import { getDb } from "@/lib/db";
import { getInviteByHostToken, getMoments, hostParticipantToken, selectableMoments } from "@/lib/invites";
import { mailConfigured } from "@/lib/mail";
import { earliestMomentInput, formatMoment } from "@/lib/time";
import { baseUrl, paths } from "@/lib/url";

export const metadata: Metadata = { title: "Jouw uitnodiging", robots: { index: false } };

export default async function ManagePage(props: PageProps<"/beheer/[token]">) {
  const { token } = await props.params;
  const { nieuw } = await props.searchParams;
  const db = await getDb();
  const invite = await getInviteByHostToken(db, token);
  if (!invite) notFound();

  const now = new Date();
  const moments = await getMoments(db, invite.id);
  const open = selectableMoments(moments, now);
  const inviteUrl = `${await baseUrl()}${paths.invite(invite.code)}`;
  const match = invite.match_name || "je match";
  const dateToken = await hostParticipantToken(db, invite);
  const guest = dateToken
    ? (await db.query<{ first_name: string; starts_at: Date }>(
        `select p.first_name, d.starts_at from participants p join dates d on d.id = p.date_id where p.date_id = $1 and p.role = 'guest'`,
        [invite.date_id],
      ))[0]
    : undefined;

  return (
    <div className="container narrow section stack-lg">
      {nieuw && (
        <div className="notice good">
          <strong>Je uitnodiging staat klaar.</strong> Bewaar deze pagina: via deze link volg je de uitnodiging en kom je
          straks in de videodate.{" "}
          {mailConfigured() ? `We hebben de link ook naar ${invite.host_email} gestuurd.` : "Zet hem bijvoorbeeld in je favorieten."}
        </div>
      )}

      {invite.status === "scheduled" && guest && dateToken && (
        <div className="card stack">
          <p className="eyebrow">Gepland</p>
          <h1>
            {guest.first_name} doet mee
          </h1>
          <p className="moment">{formatMoment(guest.starts_at)}</p>
          <p className="muted">
            Jullie hebben {DATE_MINUTES} minuten. De ruimte gaat vlak van tevoren open en sluit daarna vanzelf.
          </p>
          <Link className="btn large" href={paths.date(dateToken)}>
            Naar jullie videodate
          </Link>
        </div>
      )}

      {invite.status === "cancelled" && (
        <div className="card stack">
          <h1>Deze uitnodiging gaat niet door</h1>
          <p className="muted">De uitnodiging is ingetrokken of de videodate is afgezegd.</p>
          <Link className="btn" href="/uitnodigen">
            Nieuwe uitnodiging maken
          </Link>
        </div>
      )}

      {invite.status === "alternative" && invite.alt_starts_at && (
        <div className="card stack">
          <p className="eyebrow">Voorstel</p>
          <h1>{invite.alt_guest_name} stelt een ander moment voor</h1>
          <p className="moment">{formatMoment(invite.alt_starts_at)}</p>
          <div className="row">
            <ActionForm action={acceptAlternativeAction.bind(null, token)}>
              <SubmitButton>Dat past, plan het in</SubmitButton>
            </ActionForm>
            <ActionForm action={declineAlternativeAction.bind(null, token)}>
              <SubmitButton className="btn secondary">Past niet</SubmitButton>
            </ActionForm>
          </div>
          <p className="muted small">
            Past het niet? Dan blijft je uitnodiging open en kan {invite.alt_guest_name} opnieuw kiezen. Voeg hieronder
            eventueel een nieuw moment toe.
          </p>
        </div>
      )}

      {(invite.status === "open" || invite.status === "alternative") && (
        <>
          <div className="stack">
            {invite.status === "open" && (
              <>
                <p className="eyebrow">Uitnodiging</p>
                <h1>Stuur deze link naar {match}</h1>
                <p className="muted">
                  Plak hem in jullie chat. {invite.match_name || "Je match"} kiest een moment en jullie zien elkaar op
                  video. Je hoort het zodra er gekozen is.
                </p>
              </>
            )}
            <CopyLink url={inviteUrl} shareText={`Zin in een videodate van ${DATE_MINUTES} minuten? Kies hier een moment:`} />
          </div>

          <div className="card flat stack">
            <h2>Voorgestelde momenten</h2>
            {open.length > 0 ? (
              <ul>
                {open.map((m) => (
                  <li key={m.toISOString()}>{formatMoment(m)}</li>
                ))}
              </ul>
            ) : (
              <p className="notice">Alle momenten zijn voorbij. Voeg een nieuw moment toe.</p>
            )}
            {open.length < MAX_PROPOSED_MOMENTS && (
              <ActionForm action={addMomentAction.bind(null, token)} className="row">
                <input
                  type="datetime-local"
                  name="moment"
                  required
                  step={900}
                  min={earliestMomentInput(MIN_LEAD_MINUTES, now)}
                  aria-label="Nieuw moment"
                  style={{ flex: "1 1 220px", width: "auto" }}
                />
                <SubmitButton className="btn secondary">Moment toevoegen</SubmitButton>
              </ActionForm>
            )}
          </div>

          <details>
            <summary>Uitnodiging intrekken</summary>
            <ActionForm action={cancelInviteAction.bind(null, token)} className="stack">
              <p className="muted">De link werkt daarna niet meer. {invite.match_name || "Je match"} krijgt geen bericht van ons.</p>
              <SubmitButton className="btn danger">Ja, intrekken</SubmitButton>
            </ActionForm>
          </details>
        </>
      )}
    </div>
  );
}
