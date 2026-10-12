"use client";

import { useActionState } from "react";
import { lostLinkAction, waitlistAction } from "@/app/actions/community";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";
import { REGIONS } from "@/lib/config";

export function WaitlistForm() {
  const [state, action] = useActionState(waitlistAction, undefined);
  const f = state?.fields ?? {};
  if (f.done) {
    return (
      <div className="notice good" role="status">
        <strong>Je staat op de lijst.</strong> Je hoort van ons zodra Cafe opengaat, en als er een proefavond in jouw regio is.
      </div>
    );
  }
  return (
    <form action={action} className="stack">
      <div className="two">
        <label className="field">
          <span className="label">Voornaam</span>
          <input type="text" name="firstName" required maxLength={40} autoComplete="given-name" defaultValue={f.firstName} />
        </label>
        <label className="field">
          <span className="label">E-mail</span>
          <input type="email" name="email" required autoComplete="email" defaultValue={f.email} />
        </label>
      </div>
      <label className="field">
        <span className="label">Regio</span>
        <select name="region" required defaultValue={f.region ?? ""}>
          <option value="" disabled>
            Kies je regio
          </option>
          {REGIONS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <FormError error={state?.error} />
      <SubmitButton>Zet me op de lijst</SubmitButton>
    </form>
  );
}

export function LostLinkForm() {
  const [state, action] = useActionState(lostLinkAction, undefined);
  const f = state?.fields ?? {};
  if (f.done) {
    return (
      <div className="notice good" role="status">
        Als we dit adres kennen, staan je links binnen een paar minuten in je mailbox. Kijk ook even bij je spam.
      </div>
    );
  }
  return (
    <form action={action} className="stack card">
      <label className="field">
        <span className="label">E-mailadres</span>
        <input type="email" name="email" required autoComplete="email" defaultValue={f.email} />
      </label>
      <FormError error={state?.error} />
      <SubmitButton>Stuur mijn links</SubmitButton>
    </form>
  );
}
