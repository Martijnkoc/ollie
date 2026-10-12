/** A problem the visitor can fix or should know about; the message is shown as-is (Dutch). */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export type FormState = { error?: string; fields?: Record<string, string> } | undefined;

export function errorState(err: unknown, fields?: Record<string, string>): FormState {
  if (err instanceof UserError) return { error: err.message, fields };
  console.error(err);
  return { error: "Er ging iets mis aan onze kant. Probeer het zo nog eens.", fields };
}

/** Plain object of the submitted text fields, used to refill a form after an error. */
export function formFields(formData: FormData) {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) out[key] = value;
  }
  return out;
}
