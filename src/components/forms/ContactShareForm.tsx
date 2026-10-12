"use client";

import { useActionState } from "react";
import { shareContactAction } from "@/app/actions/dates";
import { Field } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";

export function ContactShareForm({
  dateId,
  field,
  label,
  placeholder,
  otherName,
}: {
  dateId: string;
  field: string;
  label: string;
  placeholder: string;
  otherName: string;
}) {
  const [state, action] = useActionState(shareContactAction.bind(null, dateId, field), undefined);
  const id = `share-${field}`;
  return (
    <form action={action} className="stack card flat">
      <Field id={id} label={label}>
        <input
          type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
          name="value"
          required
          maxLength={120}
          placeholder={placeholder}
          defaultValue={state?.fields?.value}
        />
      </Field>
      <label className="check">
        <input type="checkbox" name="consent" required />
        <span>
          Ik deel dit bewust met {otherName}. Ik begrijp dat {otherName} het kan bewaren en dat intrekken het niet bij {otherName}{" "}
          terughaalt.
        </span>
      </label>
      <FormError error={state?.error} />
      <SubmitButton className="btn secondary">Deel met {otherName}</SubmitButton>
    </form>
  );
}
