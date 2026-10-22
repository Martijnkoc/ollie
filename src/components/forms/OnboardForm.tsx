"use client";

import { useActionState, useState } from "react";
import { onboardAction } from "@/app/actions/profile";
import { Field } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";

function slug(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export function OnboardForm({ next, sell }: { next: string; sell: boolean }) {
  const [state, action] = useActionState(onboardAction, undefined);
  const f = state?.fields ?? {};
  const [name, setName] = useState(f.displayName ?? "");
  const [username, setUsername] = useState(f.username ?? "");
  const [touched, setTouched] = useState(Boolean(f.username));
  const handle = touched ? username : slug(name);

  return (
    <form action={action} className="stack-lg">
      <input type="hidden" name="next" value={next} />
      <fieldset>
        <legend>Wat wil je doen?</legend>
        <div className="option-cards">
          <label className="option-card">
            <input type="radio" name="intent" value="sell" defaultChecked={(f.intent ?? (sell ? "sell" : "buy")) === "sell"} />
            <strong>Mijn talent verkopen</strong>
            <span className="small muted">Een profiel met portfolio, diensten en prijzen. Kopen kan daarna ook gewoon.</span>
          </label>
          <label className="option-card">
            <input type="radio" name="intent" value="buy" defaultChecked={(f.intent ?? (sell ? "sell" : "buy")) === "buy"} />
            <strong>Talent ontdekken en inhuren</strong>
            <span className="small muted">Volgen, bewaren, berichten en boeken. Verkopen kun je later altijd nog aanzetten.</span>
          </label>
        </div>
      </fieldset>
      <div className="two">
        <Field id="ob-name" label="Je naam" hint="Zoals anderen je zien. Je voornaam, volledige naam of artiestennaam.">
          <input
            type="text"
            name="displayName"
            required
            minLength={2}
            maxLength={60}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id="ob-username" label="Gebruikersnaam" hint={`Je adres wordt sellyourself.nl/@${handle || "jouwnaam"}`}>
          <input
            type="text"
            name="username"
            required
            minLength={3}
            maxLength={30}
            pattern="[a-z0-9][a-z0-9._\-]*[a-z0-9]"
            autoCapitalize="none"
            spellCheck={false}
            value={handle}
            onChange={(e) => {
              setTouched(true);
              setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""));
            }}
          />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" name="terms" required defaultChecked={f.terms === "on"} />
        <span className="small">
          Ik ben 18 jaar of ouder en ga akkoord met de{" "}
          <a href="/voorwaarden" target="_blank">
            voorwaarden
          </a>{" "}
          en de{" "}
          <a href="/privacy" target="_blank">
            privacyverklaring
          </a>
          .
        </span>
      </label>
      <FormError error={state?.error} />
      <SubmitButton className="btn large" pendingText="Even geduld…">
        Doorgaan
      </SubmitButton>
    </form>
  );
}
