import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { confirmGuestAction, rejectGuestAction, revokeInviteAction } from "@/app/actions/invites";
import { ActionForm } from "@/components/ActionForm";
import { Moment } from "@/components/Moment";
import { SubmitButton } from "@/components/SubmitButton";
import { viewer } from "@/lib/access";
import { getDb } from "@/lib/db";
import { inviteForOrganizer, inviteState, momentsOf } from "@/lib/invites";
import { formatShort } from "@/lib/time";

export const metadata: Metadata = { title: "Uitnodiging", robots: { index: false } };

export default async function ManageInvitePage(props: PageProps<"/uitnodigingen/[id]">) {
  const { id } = await props.params;
  const v = await viewer();
  if (!v) redirect(`/inloggen?next=/uitnodigingen/${id}`);
  const db = await getDb();
  const invite = await inviteForOrganizer(db, v.user.id, id);
  if (!invite) notFound();
  const state = inviteState(invite);
  const moments = await momentsOf(db, invite.id);
  const name = invite.match_name || "je match";

  return (
    <div className="container narrow page stack-lg">
      <Link href="/uitnodigen">← Alle uitnodigingen</Link>
      <h1>Uitnodiging voor {name}</h1>

      {state === "open" && (
        <div className="card stack">
          <p>
            Wacht op {name}. De link werkt tot het laatste voorgestelde moment
            {moments.length ? `: ${formatShort(moments.at(-1)!)}` : ""}.
          </p>
          <ul>
            {moments.map((m) => (
              <li key={m.toISOString()}>{formatShort(m)}</li>
            ))}
          </ul>
        </div>
      )}

      {state === "accepted" && invite.chosen_at && (
        <div className="card stack" aria-live="polite">
          <p className="eyebrow">Iemand heeft geaccepteerd</p>
          <h2>Is dit {name}?</h2>
          <p>
            <strong>{invite.guest_name}</strong> heeft de uitnodiging aangenomen voor:
          </p>
          <Moment at={invite.chosen_at.toISOString()} className="moment" />
          {invite.guest_note && <p className="quote">&ldquo;{invite.guest_note}&rdquo;</p>}
          <p className="muted small">
            Geaccepteerd {invite.accepted_at ? formatShort(invite.accepted_at) : ""} met een eigen, per e-mail bevestigd account. Dat is
            geen identiteitscontrole: herken je de naam of het berichtje niet, wijs het dan af.
          </p>
          <div className="row">
            <ActionForm action={confirmGuestAction.bind(null, invite.id)}>
              <SubmitButton>Ja, bevestig de videodate</SubmitButton>
            </ActionForm>
            <ActionForm action={rejectGuestAction.bind(null, invite.id)}>
              <SubmitButton className="btn secondary">Dit is niet mijn match</SubmitButton>
            </ActionForm>
          </div>
        </div>
      )}

      {state === "scheduled" && invite.date_id && (
        <div className="card stack">
          <p>De videodate met {invite.guest_name} staat vast.</p>
          <Link className="btn" href={`/afspraken/${invite.date_id}`}>
            Naar de afspraak
          </Link>
        </div>
      )}

      {state === "declined" && (
        <p className="notice">{name} heeft de uitnodiging vriendelijk afgeslagen. Er is niets van je tegoed gebruikt.</p>
      )}
      {state === "rejected" && (
        <p className="notice">Je hebt deze acceptatie afgewezen. De link werkt niet meer; maak zo nodig een nieuwe.</p>
      )}
      {state === "cancelled" && <p className="notice">Deze uitnodiging is ingetrokken.</p>}
      {state === "expired" && <p className="notice">Deze uitnodiging is verlopen zonder antwoord.</p>}

      {(state === "open" || state === "accepted") && (
        <details>
          <summary>Uitnodiging intrekken</summary>
          <ActionForm action={revokeInviteAction.bind(null, invite.id)} className="stack">
            <p className="muted">De link werkt daarna niet meer. Er wordt niets van je tegoed gebruikt.</p>
            <SubmitButton className="btn danger">Intrekken</SubmitButton>
          </ActionForm>
        </details>
      )}
    </div>
  );
}
