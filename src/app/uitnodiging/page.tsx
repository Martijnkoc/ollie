import type { Metadata } from "next";
import Link from "next/link";
import { declineInviteAction } from "@/app/actions/invites";
import { ActionForm } from "@/components/ActionForm";
import { InviteOpener } from "@/components/InviteOpener";
import { AcceptInviteForm } from "@/components/forms/AcceptInviteForm";
import { SubmitButton } from "@/components/SubmitButton";
import { viewer } from "@/lib/access";
import { DATE_MINUTES } from "@/lib/config";
import { getDb } from "@/lib/db";
import { inviteTokenFromCookie } from "@/lib/invite-cookie";
import { inviteByToken, inviteState, momentsOf } from "@/lib/invites";
import { formatMoment } from "@/lib/time";

export const metadata: Metadata = { title: "Uitnodiging voor een videodate", robots: { index: false } };

export default async function GuestInvitePage() {
  const db = await getDb();
  const invite = await inviteByToken(db, await inviteTokenFromCookie());
  const v = await viewer();

  return (
    <div className="container narrow page stack-lg">
      <InviteOpener hasInvite={Boolean(invite)} />
      {invite && <InviteBody invite={invite} viewerId={v?.user.id} restricted={Boolean(v?.restricted)} />}
    </div>
  );
}

async function InviteBody({
  invite,
  viewerId,
  restricted,
}: {
  invite: NonNullable<Awaited<ReturnType<typeof inviteByToken>>>;
  viewerId?: string;
  restricted: boolean;
}) {
  const state = inviteState(invite);
  const mine = viewerId && invite.guest_id === viewerId;
  const host = invite.organizer_name;

  if (viewerId === invite.organizer_id) {
    return (
      <p className="notice">
        Dit is je eigen uitnodiging. <Link href={`/uitnodigingen/${invite.id}`}>Bekijk de status</Link>
      </p>
    );
  }
  if (state === "scheduled" && mine) {
    return (
      <div className="card stack">
        <h1>Jullie videodate staat vast</h1>
        <Link className="btn" href={`/afspraken/${invite.date_id}`}>
          Naar de afspraak
        </Link>
      </div>
    );
  }
  if (state === "accepted" && mine) {
    return (
      <div className="card stack" role="status">
        <p className="eyebrow">Bijna klaar</p>
        <h1>{host} bevestigt nog dat jij het bent</h1>
        {invite.chosen_at && <p className="moment">{formatMoment(invite.chosen_at)}</p>}
        <p className="muted">Je krijgt een e-mail zodra de videodate vaststaat. Je vindt hem dan ook onder Afspraken.</p>
      </div>
    );
  }
  if (state !== "open") {
    const text: Record<string, string> = {
      accepted: "Deze uitnodiging is al beantwoord.",
      scheduled: "Deze uitnodiging is al beantwoord.",
      declined: "Je hebt deze uitnodiging afgeslagen. Er is niets met je gedeeld.",
      rejected: "Deze uitnodiging is niet meer geldig.",
      cancelled: `${host} heeft deze uitnodiging ingetrokken.`,
      expired: "Deze uitnodiging is verlopen.",
    };
    return <p className="notice">{text[state]}</p>;
  }

  const moments = await momentsOf(await getDb(), invite.id);
  return (
    <>
      <div className="stack">
        <p className="eyebrow">Uitnodiging voor een videodate</p>
        <h1>{invite.match_name ? `Hoi ${invite.match_name}!` : "Je bent uitgenodigd"}</h1>
        <p className="lead">
          {host}
          {invite.origin && invite.origin !== "Ergens anders" ? ` (van ${invite.origin})` : ""} wil je graag eerst even zien en spreken: een
          besloten videodate van {DATE_MINUTES} minuten.
        </p>
        {invite.message && (
          <blockquote className="card soft" style={{ margin: 0 }}>
            <p className="quote" style={{ margin: 0 }}>
              &ldquo;{invite.message}&rdquo;
            </p>
          </blockquote>
        )}
      </div>
      <ul className="checks">
        <li>Gratis. Je hoeft geen app te installeren en wordt geen lid van Cafe.</li>
        <li>De twintig minuten beginnen als jullie er allebei zijn; daarna sluit de ruimte vanzelf.</li>
        <li>Na afloop kies je privé of je verder wilt. Je contactgegevens blijven verborgen tot jij ze deelt.</li>
      </ul>
      {moments.length === 0 ? (
        <p className="notice">De voorgestelde momenten zijn voorbij.</p>
      ) : restricted ? (
        <p className="notice error">Je account is beperkt.</p>
      ) : viewerId ? (
        <AcceptInviteForm organizer={host} moments={moments.map((m) => ({ value: m.toISOString(), label: formatMoment(m) }))} />
      ) : (
        <div className="card stack">
          <p>
            Om mee te doen log je in met je e-mailadres. Zo kunnen alleen jij en {host} straks de videoruimte in, ook als deze link ergens
            anders terechtkomt.
          </p>
          <Link className="btn large" href="/inloggen?next=/uitnodiging">
            Inloggen en bevestigen
          </Link>
          <ActionForm action={declineInviteAction}>
            <SubmitButton className="btn ghost">Nee, dank je</SubmitButton>
          </ActionForm>
        </div>
      )}
    </>
  );
}
