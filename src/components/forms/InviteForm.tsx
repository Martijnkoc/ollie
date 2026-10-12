"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createInviteAction } from "@/app/actions/invite";
import { FormError } from "@/components/FormError";
import { MomentFields } from "@/components/MomentFields";
import { SubmitButton } from "@/components/SubmitButton";

export function InviteForm({ max, min }: { max: number; min: string }) {
  const [state, action] = useActionState(createInviteAction, undefined);
  const f = state?.fields ?? {};
  return (
    <form action={action} className="stack card">
      <div className="two">
        <label className="field">
          <span className="label">Jouw voornaam</span>
          <input type="text" name="hostName" required maxLength={40} autoComplete="given-name" defaultValue={f.hostName} />
        </label>
        <label className="field">
          <span className="label">Voornaam van je match</span>
          <input type="text" name="matchName" maxLength={40} defaultValue={f.matchName} placeholder="Optioneel" />
        </label>
      </div>
      <label className="field">
        <span className="label">Jouw e-mailadres</span>
        <input type="email" name="hostEmail" required autoComplete="email" defaultValue={f.hostEmail} />
        <span className="hint">Hier sturen we jouw persoonlijke link naartoe. Je match ziet je e-mailadres niet.</span>
      </label>
      <MomentFields max={max} min={min} defaults={f.moment?.split("|").filter(Boolean)} />
      <label className="field">
        <span className="label">Een kort berichtje</span>
        <textarea name="message" maxLength={280} placeholder="Optioneel, bijvoorbeeld: Leuk om je eens te zien en te horen!" defaultValue={f.message} />
      </label>
      <label className="check">
        <input type="checkbox" name="adult" required defaultChecked={f.adult === "on"} />
        <span>
          Ik ben 18 jaar of ouder en houd me aan de <Link href="/huisregels">huisregels</Link>.
        </span>
      </label>
      <FormError error={state?.error} />
      <SubmitButton className="btn large block" pendingText="Uitnodiging maken…">
        Maak uitnodiging
      </SubmitButton>
    </form>
  );
}
