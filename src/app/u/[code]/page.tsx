import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AcceptForm, AlternativeForm } from "@/components/forms/GuestForms";
import { BRAND, DATE_MINUTES, MIN_LEAD_MINUTES } from "@/lib/config";
import { getDb, one } from "@/lib/db";
import { guestCookieName } from "@/lib/guest";
import { getInviteByCode, getMoments, selectableMoments } from "@/lib/invites";
import { earliestMomentInput, formatMoment } from "@/lib/time";
import { paths } from "@/lib/url";

export async function generateMetadata(props: PageProps<"/u/[code]">): Promise<Metadata> {
  const { code } = await props.params;
  const invite = await getInviteByCode(await getDb(), code);
  return {
    title: invite ? `${invite.host_name} nodigt je uit` : "Uitnodiging",
    description: `Een besloten videodate van ${DATE_MINUTES} minuten via ${BRAND}. Gratis, zonder download.`,
    robots: { index: false },
  };
}

export default async function GuestInvitePage(props: PageProps<"/u/[code]">) {
  const { code } = await props.params;
  const db = await getDb();
  const invite = await getInviteByCode(db, code);
  if (!invite) notFound();

  // Someone who already answered this invite in this browser goes straight to their date.
  const remembered = (await cookies()).get(guestCookieName(code))?.value;
  if (remembered && invite.date_id) {
    const mine = await one<{ token: string }>(db, `select token from participants where token = $1 and date_id = $2`, [remembered, invite.date_id]);
    if (mine) redirect(paths.date(mine.token));
  }

  const now = new Date();
  const host = invite.host_name;

  if (invite.status === "alternative" && remembered && remembered === invite.alt_guest_token && invite.alt_starts_at) {
    return (
      <Shell>
        <div className="card stack">
          <p className="eyebrow">Voorstel verstuurd</p>
          <h1>{host} kijkt naar je voorstel</h1>
          <p className="moment">{formatMoment(invite.alt_starts_at)}</p>
          <p className="muted">
            Zodra {host} bevestigt, staat jullie videodate klaar. Open deze link later opnieuw
            {invite.alt_guest_email ? ", of wacht op ons mailtje" : ""}.
          </p>
        </div>
      </Shell>
    );
  }

  if (invite.status === "scheduled") {
    return (
      <Shell>
        <div className="card stack">
          <h1>Deze uitnodiging is al aangenomen</h1>
          <p className="muted">
            Heb jij hem aangenomen op een ander apparaat? Gebruik dan je persoonlijke link, of vraag hem opnieuw op via{" "}
            <Link href="/link-kwijt">link kwijt</Link>.
          </p>
        </div>
      </Shell>
    );
  }

  if (invite.status === "cancelled") {
    return (
      <Shell>
        <div className="card stack">
          <h1>Deze uitnodiging is niet meer geldig</h1>
          <p className="muted">{host} heeft de uitnodiging ingetrokken.</p>
        </div>
      </Shell>
    );
  }

  const moments = selectableMoments(await getMoments(db, invite.id), now);
  const min = earliestMomentInput(MIN_LEAD_MINUTES, now);

  return (
    <Shell>
      <div className="stack">
        <p className="eyebrow">Uitnodiging voor een videodate</p>
        <h1>{invite.match_name ? `Hoi ${invite.match_name}!` : "Je bent uitgenodigd"}</h1>
        <p className="lead" style={{ fontSize: "1.15rem" }}>
          {host} wil je graag even zien en spreken: een besloten videodate van {DATE_MINUTES} minuten, voordat jullie
          afspreken.
        </p>
        {invite.message && (
          <blockquote className="card soft" style={{ margin: 0 }}>
            <p style={{ fontFamily: "var(--serif)", fontSize: "1.15rem" }}>&ldquo;{invite.message}&rdquo;</p>
            <p className="muted small">— {host}</p>
          </blockquote>
        )}
      </div>

      <ul className="checks">
        <li>Gratis. Geen account, download of betaalgegevens nodig.</li>
        <li>{DATE_MINUTES} minuten, alleen jullie twee. Daarna sluit de ruimte vanzelf.</li>
        <li>Na afloop kiest ieder privé of die verder wil.</li>
        <li>Je contactgegevens blijven verborgen tot jij ze deelt.</li>
      </ul>

      {moments.length > 0 ? (
        <AcceptForm code={code} hostName={host} moments={moments.map((m) => ({ value: m.toISOString(), label: formatMoment(m) }))} />
      ) : (
        <div className="notice">De voorgestelde momenten zijn voorbij. Stel hieronder een nieuw moment voor.</div>
      )}

      <details open={moments.length === 0} className="card flat">
        <summary>Geen van deze momenten past?</summary>
        <AlternativeForm code={code} hostName={host} min={min} />
      </details>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="container narrow section stack-lg">{children}</div>;
}
