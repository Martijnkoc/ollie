"use client";

import { useActionState } from "react";
import { reportAction, shareContactAction } from "@/app/actions/date";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";
import { REPORT_REASONS } from "@/lib/config";

export function ContactForm({ token, otherName, current }: { token: string; otherName: string; current?: string | null }) {
  const [state, action] = useActionState(shareContactAction.bind(null, token), undefined);
  const f = state?.fields ?? {};
  return (
    <form action={action} className="stack">
      <label className="field">
        <span className="label">Wat wil je met {otherName} delen?</span>
        <input
          type="text"
          name="contact"
          required
          minLength={3}
          maxLength={200}
          placeholder="Bijvoorbeeld je telefoonnummer of Instagram"
          defaultValue={f.contact ?? current ?? ""}
        />
        <span className="hint">Alleen {otherName} ziet dit, en pas nadat jij op delen drukt.</span>
      </label>
      <label className="check">
        <input type="checkbox" name="consent" required />
        <span>Ik geef toestemming om dit met {otherName} te delen.</span>
      </label>
      <FormError error={state?.error} />
      <SubmitButton className="btn good">Deel met {otherName}</SubmitButton>
    </form>
  );
}

export function ReportForm({ token, otherName }: { token: string; otherName: string }) {
  const [state, action] = useActionState(reportAction.bind(null, token), undefined);
  const f = state?.fields ?? {};
  return (
    <form action={action} className="stack">
      <fieldset>
        <legend>Wat is er gebeurd?</legend>
        <div className="choices">
          {REPORT_REASONS.map((r) => (
            <label key={r.key} className="choice">
              <input type="radio" name="reason" value={r.key} required defaultChecked={f.reason === r.key} />
              <span>{r.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span className="label">Toelichting (optioneel)</span>
        <textarea name="details" maxLength={2000} defaultValue={f.details} />
      </label>
      <label className="check">
        <input type="checkbox" name="block" defaultChecked />
        <span>Blokkeer {otherName} ook</span>
      </label>
      <FormError error={state?.error} />
      <SubmitButton className="btn danger">Melding versturen</SubmitButton>
      <p className="hint">Meldingen behandelen we vertrouwelijk en los van je feedback. {otherName} ziet niet dat je iets gemeld hebt.</p>
    </form>
  );
}
