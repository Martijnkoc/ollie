"use client";

import Link from "next/link";
import { useActionState } from "react";
import { acceptInviteAction, declineInviteAction } from "@/app/actions/invites";
import { ActionForm } from "@/components/ActionForm";
import { Field } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";

export function AcceptInviteForm({ moments, organizer }: { moments: { value: string; label: string }[]; organizer: string }) {
  const [state, action] = useActionState(acceptInviteAction, undefined);
  const f = state?.fields ?? {};
  return (
    <div className="stack">
      <form action={action} className="stack card">
        <fieldset>
          <legend>Kies een moment</legend>
          <div className="choices">
            {moments.map((m, i) => (
              <label key={m.value} className="choice">
                <input
                  type="radio"
                  name="moment"
                  value={m.value}
                  required
                  defaultChecked={f.moment ? f.moment === m.value : moments.length === 1 && i === 0}
                />
                <span>
                  {m.label}
                  <span className="sub">Europe/Amsterdam</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field id="accept-name" label="Je voornaam">
          <input type="text" name="name" required maxLength={30} autoComplete="given-name" defaultValue={f.name} />
        </Field>
        <Field
          id="accept-note"
          label={`Een berichtje voor ${organizer} (optioneel)`}
          hint={`Zo herkent ${organizer} je. ${organizer} bevestigt daarna dat jij het bent.`}
        >
          <input type="text" name="note" maxLength={200} defaultValue={f.note} />
        </Field>
        <label className="check">
          <input type="checkbox" name="agree" required defaultChecked={f.agree === "on"} />
          <span>
            Ik ben 18 jaar of ouder en houd me aan de <Link href="/huisregels">huisregels</Link>.
          </span>
        </label>
        <FormError error={state?.error} />
        <SubmitButton className="btn large block">Ik doe mee</SubmitButton>
      </form>
      <ActionForm action={declineInviteAction}>
        <SubmitButton className="btn ghost">Nee, dank je</SubmitButton>
      </ActionForm>
    </div>
  );
}
