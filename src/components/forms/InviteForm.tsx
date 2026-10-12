"use client";

import { useActionState } from "react";
import { createInviteAction } from "@/app/actions/invites";
import { CopyLink } from "@/components/CopyLink";
import { Field } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { MomentFields } from "@/components/MomentFields";
import { SubmitButton } from "@/components/SubmitButton";
import { MATCH_ORIGINS } from "@/lib/config";

export function InviteForm({ max, min, available }: { max: number; min: string; available: number }) {
  const [state, action] = useActionState(createInviteAction, undefined);
  const token = state?.fields?.token;

  if (token) {
    // The token lives only in the URL fragment: browsers never send it to a server.
    const link = `${window.location.origin}/uitnodiging#${token}`;
    return (
      <div className="card stack" role="status">
        <p className="eyebrow">Klaar</p>
        <h2>Deel deze link in jullie chat</h2>
        <CopyLink url={link} shareText="Zin in een videodate van twintig minuten via Cafe? Kies hier een moment:" />
        <p className="notice warn">
          We tonen deze link maar één keer: we bewaren hem zelf niet. Kwijt? Trek de uitnodiging in en maak een nieuwe.
        </p>
        <p className="muted small">
          Je match logt in met een e-mailcode en bevestigt een moment. Daarna zie jij wie er heeft geaccepteerd en bevestig je het. Pas dan
          staat de videodate vast.
        </p>
      </div>
    );
  }

  const f = state?.fields ?? {};
  return (
    <form action={action} className="stack card">
      <div className="two">
        <Field id="invite-name" label="Voornaam van je match" hint="Zo begroeten we je match op de uitnodiging.">
          <input type="text" name="matchName" maxLength={30} defaultValue={f.matchName} placeholder="Optioneel" />
        </Field>
        <Field id="invite-origin" label="Waar matchten jullie?" hint="Helpt je match de uitnodiging te herkennen.">
          <select name="origin" defaultValue={f.origin ?? ""}>
            <option value="">Zeg ik liever niet</option>
            {MATCH_ORIGINS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <MomentFields max={max} min={min} defaults={f.moment?.split("|").filter(Boolean)} />
      <Field id="invite-message" label="Een kort berichtje (optioneel)">
        <textarea name="message" maxLength={280} defaultValue={f.message} placeholder="Leuk om je eens te zien en te horen!" />
      </Field>
      <p className="muted small">
        Dit gebruikt één videodate van je tegoed zodra jullie allebei bevestigen. Je hebt er nog {available} deze periode.
      </p>
      <FormError error={state?.error} />
      <SubmitButton className="btn large block" pendingText="Uitnodiging maken…">
        Maak uitnodigingslink
      </SubmitButton>
    </form>
  );
}
