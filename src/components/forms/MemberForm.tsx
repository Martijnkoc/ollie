"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";
import { GENDERS, INTENTS, MIN_AGE, REGIONS, SLOTS } from "@/lib/config";
import type { FormState } from "@/lib/errors";

export type MemberDefaults = {
  firstName?: string;
  gender?: string;
  lookingFor?: string[];
  ageMin?: number;
  ageMax?: number;
  region?: string;
  intent?: string;
  about?: string;
  slots?: string[];
  visible?: boolean;
};

export function MemberForm({
  mode,
  action,
  defaults = {},
  source,
  launchLabel,
}: {
  mode: "signup" | "edit";
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: MemberDefaults;
  source?: string;
  launchLabel: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const f = state?.fields;
  const val = (key: string, fallback?: string | number) => (f ? f[key] : fallback?.toString()) ?? "";
  const list = (key: string, fallback: string[] = []) => (f ? (f[key] ?? "").split("|").filter(Boolean) : fallback);

  if (f?.sent) {
    return (
      <div className="notice good" role="status">
        <strong>Je was al aangemeld.</strong> We hebben een nieuwe persoonlijke link naar {f.email} gestuurd. Daarmee pas je
        je voorkeuren aan.
      </div>
    );
  }

  return (
    <form action={formAction} className="stack card">
      {source && <input type="hidden" name="van" value={source} />}
      <div className="two">
        <label className="field">
          <span className="label">Voornaam</span>
          <input type="text" name="firstName" required maxLength={40} autoComplete="given-name" defaultValue={val("firstName", defaults.firstName)} />
        </label>
        {mode === "signup" && (
          <label className="field">
            <span className="label">Geboortedatum</span>
            <input type="date" name="birthDate" required autoComplete="bday" defaultValue={val("birthDate")} />
          </label>
        )}
      </div>
      {mode === "signup" && (
        <label className="field">
          <span className="label">E-mailadres</span>
          <input type="email" name="email" required autoComplete="email" defaultValue={val("email")} />
          <span className="hint">Hier sturen we je voorstellen naartoe. Niemand anders ziet je e-mailadres.</span>
        </label>
      )}

      <fieldset>
        <legend>Ik ben</legend>
        <div className="choices inline">
          {GENDERS.map((g) => (
            <label key={g.key} className="choice">
              <input type="radio" name="gender" value={g.key} required defaultChecked={val("gender", defaults.gender) === g.key} />
              <span>{g.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Ik wil kennismaken met</legend>
        <div className="choices inline">
          {GENDERS.map((g) => (
            <label key={g.key} className="choice">
              <input type="checkbox" name="lookingFor" value={g.key} defaultChecked={list("lookingFor", defaults.lookingFor).includes(g.key)} />
              <span>{g.plural}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Leeftijd</legend>
        <div className="row">
          <input type="number" name="ageMin" min={MIN_AGE} max={99} required aria-label="Vanaf leeftijd" defaultValue={val("ageMin", defaults.ageMin ?? 25)} style={{ width: 96 }} />
          <span>tot en met</span>
          <input type="number" name="ageMax" min={MIN_AGE} max={99} required aria-label="Tot en met leeftijd" defaultValue={val("ageMax", defaults.ageMax ?? 40)} style={{ width: 96 }} />
          <span>jaar</span>
        </div>
      </fieldset>

      <label className="field">
        <span className="label">Regio</span>
        <select name="region" required defaultValue={val("region", defaults.region)}>
          <option value="" disabled>
            Kies je regio
          </option>
          {REGIONS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <span className="hint">We beginnen in {launchLabel}. Woon je elders? Meld je toch aan: we openen jouw regio zodra er genoeg mensen zijn.</span>
      </label>

      <fieldset>
        <legend>Wat zoek je?</legend>
        <div className="choices">
          {INTENTS.map((i) => (
            <label key={i.key} className="choice">
              <input type="radio" name="intent" value={i.key} required defaultChecked={val("intent", defaults.intent) === i.key} />
              <span>{i.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Welke momenten schikken je meestal?</legend>
        <div className="choices inline">
          {SLOTS.map((s) => (
            <label key={s.key} className="choice">
              <input type="checkbox" name="slots" value={s.key} defaultChecked={list("slots", defaults.slots).includes(s.key)} />
              <span>
                {s.label}
                <span className="sub">om {s.time}</span>
              </span>
            </label>
          ))}
        </div>
        <span className="hint">Je zegt per voorstel nog ja of nee, dus je zit nergens aan vast.</span>
      </fieldset>

      <label className="field">
        <span className="label">Over jou, in één zin</span>
        <input
          type="text"
          name="about"
          maxLength={140}
          placeholder="Optioneel, bijvoorbeeld: Fietst graag naar de kust en bakt te veel brood."
          defaultValue={val("about", defaults.about)}
        />
        <span className="hint">Dit ziet degene aan wie we je voorstellen, samen met je voornaam, leeftijd en wat je zoekt.</span>
      </label>

      <label className="check">
        <input type="checkbox" name="visible" defaultChecked={f ? f.visible === "on" : (defaults.visible ?? true)} />
        <span>
          Je mag mij voorstellen aan andere deelnemers
          <span className="hint" style={{ marginTop: 0 }}>
            Je kunt dit altijd uitzetten, bijvoorbeeld als je even geen tijd hebt.
          </span>
        </span>
      </label>

      {mode === "signup" && (
        <label className="check">
          <input type="checkbox" name="adult" required defaultChecked={f?.adult === "on"} />
          <span>
            Ik ben 18 jaar of ouder en houd me aan de <Link href="/huisregels">huisregels</Link>.
          </span>
        </label>
      )}

      <FormError error={state?.error} />
      <SubmitButton className="btn large block" pendingText="Opslaan…">
        {mode === "signup" ? "Aanmelden" : "Voorkeuren opslaan"}
      </SubmitButton>
    </form>
  );
}
