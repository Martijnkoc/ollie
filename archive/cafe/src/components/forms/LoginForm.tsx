"use client";

import { useActionState, useEffect, useRef } from "react";
import { requestCodeAction, verifyCodeAction } from "@/app/actions/auth";
import { Field } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";

export function LoginForm({ next }: { next: string }) {
  const [requested, request] = useActionState(requestCodeAction, undefined);
  const [verified, verify] = useActionState(verifyCodeAction, undefined);
  const codeStep = requested?.fields?.step === "code" || verified?.fields?.step === "code";
  const email = verified?.fields?.email ?? requested?.fields?.email ?? "";
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (codeStep) codeRef.current?.focus();
  }, [codeStep]);

  if (!codeStep) {
    return (
      <form action={request} className="stack card">
        <Field
          id="login-email"
          label="E-mailadres"
          hint="We sturen je een code van zes cijfers. Geen wachtwoord nodig. Nieuw hier? Dan maken we meteen een account aan."
        >
          <input type="email" name="email" required autoComplete="email" defaultValue={email} />
        </Field>
        <FormError error={requested?.error} />
        <SubmitButton className="btn large block" pendingText="Code versturen…">
          Stuur mij een code
        </SubmitButton>
      </form>
    );
  }

  return (
    <form action={verify} className="stack card">
      <FormError success={requested?.success} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <Field
        id="login-code"
        label="Code uit de e-mail"
        hint="De code is tien minuten geldig. Niets ontvangen? Kijk in je spam of vraag een nieuwe aan."
      >
        <input
          ref={codeRef}
          type="text"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          className="code-input"
          aria-invalid={verified?.error ? true : undefined}
        />
      </Field>
      <FormError error={verified?.error} />
      <SubmitButton className="btn large block" pendingText="Controleren…">
        Inloggen
      </SubmitButton>
    </form>
  );
}
