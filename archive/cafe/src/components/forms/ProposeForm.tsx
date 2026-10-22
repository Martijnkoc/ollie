"use client";

import { useActionState } from "react";
import { proposeDateAction } from "@/app/actions/dates";
import { Field } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";

export function ProposeForm({
  otherId,
  otherName,
  source,
  parentDateId = null,
  min,
}: {
  otherId: string;
  otherName: string;
  source: "community" | "followup";
  parentDateId?: string | null;
  min: string;
}) {
  const [state, action] = useActionState(proposeDateAction.bind(null, otherId, source, parentDateId), undefined);
  return (
    <form action={action} className="stack">
      <Field
        id={`propose-${source}`}
        label="Wanneer?"
        hint={`Tijdzone Europe/Amsterdam. ${otherName} bevestigt het moment; pas dan staat de videodate vast en wordt er een videodate van jouw tegoed gereserveerd.`}
      >
        <input type="datetime-local" name="moment" required min={min} step={900} defaultValue={state?.fields?.moment} />
      </Field>
      <FormError error={state?.error} />
      <SubmitButton>Videodate voorstellen</SubmitButton>
    </form>
  );
}
