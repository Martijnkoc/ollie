"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/errors";
import { FormError } from "./FormError";

/** A form around a server action that reports problems inline instead of failing the page. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      <FormError error={state?.error} success={state?.success} />
    </form>
  );
}
