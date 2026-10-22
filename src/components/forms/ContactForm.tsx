"use client";

import { useActionState } from "react";
import { startConversationAction } from "@/app/actions/messages";
import { Field } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";

export function ContactForm({ userId, name, about }: { userId: string; name: string; about?: string }) {
  const [state, action] = useActionState(startConversationAction.bind(null, userId), undefined);
  return (
    <form action={action} className="stack">
      <Field
        id={`contact-${userId}`}
        label={`Bericht aan ${name}`}
        hint="Stel je vraag of vertel kort wat je zoekt. Deel geen betaalgegevens in berichten."
      >
        <textarea
          name="body"
          required
          maxLength={4000}
          defaultValue={state?.fields?.body ?? (about ? `Hoi ${name}, ik heb een vraag over "${about}": ` : "")}
        />
      </Field>
      <FormError error={state?.error} />
      <SubmitButton>Versturen</SubmitButton>
    </form>
  );
}
