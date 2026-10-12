import type { Metadata } from "next";
import { connection } from "next/server";
import { InviteForm } from "@/components/forms/InviteForm";
import { DATE_MINUTES, MAX_PROPOSED_MOMENTS, MIN_LEAD_MINUTES, MONTHLY_DATE_LIMIT } from "@/lib/config";
import { earliestMomentInput } from "@/lib/time";

export const metadata: Metadata = { title: "Match uitnodigen" };

export default async function InvitePage() {
  await connection();
  const min = earliestMomentInput(MIN_LEAD_MINUTES);
  return (
    <div className="container narrow section stack-lg">
      <div>
        <p className="eyebrow">Ik heb al een match</p>
        <h1>Nodig je match uit voor een videodate</h1>
        <p className="muted">
          Jij maakt de afspraak aan, je match kiest een moment. {DATE_MINUTES} minuten, alleen jullie twee, daarna sluit de
          ruimte vanzelf. Je match heeft geen account, download of betaalgegevens nodig.
        </p>
      </div>
      <InviteForm max={MAX_PROPOSED_MOMENTS} min={min} />
      <p className="muted small">
        Tijdens de proefperiode zijn videodates gratis, tot {MONTHLY_DATE_LIMIT} uitnodigingen per maand.
      </p>
    </div>
  );
}
