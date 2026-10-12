"use client";

import { useActionState } from "react";
import { checkoutAction, portalAction } from "@/app/actions/billing";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";

export function CheckoutButton({ label }: { label: string }) {
  const [state, action] = useActionState(checkoutAction, undefined);
  return (
    <form action={action} className="stack">
      <SubmitButton className="btn large" pendingText="Naar de betaalpagina…">
        {label}
      </SubmitButton>
      <FormError error={state?.error} />
    </form>
  );
}

export function PortalButton() {
  const [state, action] = useActionState(portalAction, undefined);
  return (
    <form action={action} className="stack">
      <SubmitButton className="btn secondary" pendingText="Openen…">
        Betaalgegevens of opzeggen
      </SubmitButton>
      <FormError error={state?.error} />
    </form>
  );
}
