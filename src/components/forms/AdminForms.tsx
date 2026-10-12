"use client";

import { useActionState } from "react";
import { createEveningAction, loginAction } from "@/app/actions/admin";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";
import { REGIONS, SLOTS } from "@/lib/config";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="stack card">
      <label className="field">
        <span className="label">Wachtwoord</span>
        <input type="password" name="password" required autoComplete="current-password" />
      </label>
      <FormError error={state?.error} />
      <SubmitButton>Inloggen</SubmitButton>
    </form>
  );
}

export function EveningForm({ defaultRegion, minDay }: { defaultRegion: string; minDay: string }) {
  const [state, action] = useActionState(createEveningAction, undefined);
  const f = state?.fields ?? {};
  return (
    <form action={action} className="stack card">
      <div className="two">
        <label className="field">
          <span className="label">Regio</span>
          <select name="region" required defaultValue={f.region ?? defaultRegion}>
            {REGIONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Moment</span>
          <select name="slot" required defaultValue={f.slot ?? SLOTS[0].key}>
            {SLOTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} {s.time}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="label">Datum</span>
        <input type="date" name="day" required min={minDay} defaultValue={f.day} />
      </label>
      <FormError error={state?.error} />
      <SubmitButton>Avond plannen</SubmitButton>
    </form>
  );
}
