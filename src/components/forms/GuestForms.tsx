"use client";

import Link from "next/link";
import { useActionState } from "react";
import { acceptMomentAction, proposeAlternativeAction } from "@/app/actions/invite";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";

function AboutYou({ f, hostName }: { f: Record<string, string>; hostName: string }) {
  return (
    <>
      <div className="two">
        <label className="field">
          <span className="label">Jouw voornaam</span>
          <input type="text" name="guestName" required maxLength={40} autoComplete="given-name" defaultValue={f.guestName} />
        </label>
        <label className="field">
          <span className="label">E-mail (optioneel)</span>
          <input type="email" name="guestEmail" autoComplete="email" defaultValue={f.guestEmail} />
        </label>
      </div>
      <span className="hint" style={{ marginTop: 6 }}>
        Met je e-mail krijg je je persoonlijke link en een seintje als er iets verandert. {hostName} ziet je e-mailadres niet.
      </span>
      <label className="check">
        <input type="checkbox" name="adult" required defaultChecked={f.adult === "on"} />
        <span>
          Ik ben 18 jaar of ouder en houd me aan de <Link href="/huisregels">huisregels</Link>.
        </span>
      </label>
    </>
  );
}

export function AcceptForm({ code, hostName, moments }: { code: string; hostName: string; moments: { value: string; label: string }[] }) {
  const [state, action] = useActionState(acceptMomentAction.bind(null, code), undefined);
  const f = state?.fields ?? {};
  return (
    <form action={action} className="stack card">
      <fieldset>
        <legend>Kies een moment</legend>
        <div className="choices">
          {moments.map((m, i) => (
            <label key={m.value} className="choice">
              <input type="radio" name="moment" value={m.value} required defaultChecked={f.moment ? f.moment === m.value : i === 0 && moments.length === 1} />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <AboutYou f={f} hostName={hostName} />
      <FormError error={state?.error} />
      <SubmitButton className="btn large block" pendingText="Bezig…">
        Ik doe mee
      </SubmitButton>
    </form>
  );
}

export function AlternativeForm({ code, hostName, min }: { code: string; hostName: string; min: string }) {
  const [state, action] = useActionState(proposeAlternativeAction.bind(null, code), undefined);
  const f = state?.fields ?? {};
  return (
    <form action={action} className="stack">
      <label className="field">
        <span className="label">Welk moment past jou wel?</span>
        <input type="datetime-local" name="alternative" required min={min} step={900} defaultValue={f.alternative} />
        <span className="hint">{hostName} krijgt je voorstel en bevestigt het.</span>
      </label>
      <AboutYou f={f} hostName={hostName} />
      <FormError error={state?.error} />
      <SubmitButton className="btn secondary">Stel dit moment voor</SubmitButton>
    </form>
  );
}
