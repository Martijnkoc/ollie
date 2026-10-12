import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/Empty";
import { InviteForm } from "@/components/forms/InviteForm";
import { requireCommunity } from "@/lib/access";
import { creditSummary } from "@/lib/billing/credits";
import { DATE_MINUTES, MAX_PROPOSED_MOMENTS, MIN_LEAD_MINUTES } from "@/lib/config";
import { getDb } from "@/lib/db";
import { inviteState, invitesFor } from "@/lib/invites";
import { earliestMomentInput, formatShort } from "@/lib/time";

export const metadata: Metadata = { title: "Match uitnodigen", robots: { index: false } };

const STATE: Record<string, string> = {
  open: "Wacht op je match",
  accepted: "Bevestig wie dit is",
  scheduled: "Gepland",
  declined: "Afgeslagen",
  rejected: "Afgewezen door jou",
  cancelled: "Ingetrokken",
  expired: "Verlopen",
};

export default async function InvitePage() {
  const v = await requireCommunity("/uitnodigen");
  const db = await getDb();
  const [credits, invites] = await Promise.all([creditSummary(db, v.user.id), invitesFor(db, v.user.id)]);
  return (
    <div className="container narrow page stack-lg">
      <div>
        <p className="eyebrow">Ik heb al een match</p>
        <h1>Nodig je match uit</h1>
        <p className="lead">
          Een besloten videodate van {DATE_MINUTES} minuten. Je match betaalt niets, heeft geen app nodig en wordt niet automatisch lid van
          Cafe.
        </p>
      </div>
      {credits.available > 0 ? (
        <InviteForm max={MAX_PROPOSED_MOMENTS} min={earliestMomentInput(MIN_LEAD_MINUTES)} available={credits.available} />
      ) : (
        <p className="notice">
          Je videodates voor deze periode zijn op. <Link href="/lidmaatschap">Bekijk je lidmaatschap</Link>
        </p>
      )}
      <section className="stack" aria-labelledby="mijn-uitnodigingen">
        <h2 id="mijn-uitnodigingen">Je uitnodigingen</h2>
        {invites.length === 0 ? (
          <Empty title="Nog geen uitnodigingen" />
        ) : (
          <ul className="list">
            {invites.map((i) => (
              <li key={i.id}>
                <Link href={`/uitnodigingen/${i.id}`} className="card flat card-link row between">
                  <span>
                    <strong>{i.match_name || "Je match"}</strong>
                    <span className="muted small" style={{ display: "block" }}>
                      {i.origin ? `${i.origin} · ` : ""}gemaakt {formatShort(i.created_at)}
                    </span>
                  </span>
                  <span className={`badge ${inviteState(i) === "accepted" ? "lime" : inviteState(i) === "scheduled" ? "good" : ""}`}>
                    {STATE[inviteState(i)]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
