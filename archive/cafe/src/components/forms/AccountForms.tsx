"use client";

import { useActionState } from "react";
import { appealAction, deleteAccountAction } from "@/app/actions/account";
import { Field } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccountAction, undefined);
  return (
    <form action={action} className="stack">
      <Field id="delete-confirm" label="Typ VERWIJDER om te bevestigen">
        <input type="text" name="confirm" required autoComplete="off" />
      </Field>
      <FormError error={state?.error} />
      <SubmitButton className="btn danger">Account en gegevens verwijderen</SubmitButton>
    </form>
  );
}

export function AppealForm() {
  const [state, action] = useActionState(appealAction, undefined);
  if (state?.success) return <FormError success={state.success} />;
  return (
    <form action={action} className="stack">
      <Field id="appeal-body" label="Waarom ben je het hier niet mee eens?">
        <textarea name="body" required minLength={10} maxLength={2000} defaultValue={state?.fields?.body} />
      </Field>
      <FormError error={state?.error} />
      <SubmitButton>Bezwaar indienen</SubmitButton>
    </form>
  );
}
