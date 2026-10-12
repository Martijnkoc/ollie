"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveProfileAction } from "@/app/actions/profile";
import { Field } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";
import { INTENTS, INTERESTS, REGIONS } from "@/lib/config";

export type ProfileDefaults = {
  alias?: string;
  region?: string;
  intent?: string;
  interests?: string[];
  bio?: string;
  showAge?: boolean;
  showRegion?: boolean;
  listed?: boolean;
};

export function ProfileForm({ mode, next, defaults = {} }: { mode: "new" | "edit"; next: string; defaults?: ProfileDefaults }) {
  const [state, action] = useActionState(saveProfileAction.bind(null, next), undefined);
  const f = state?.fields;
  const val = (k: string, d?: string) => (f ? (f[k] ?? "") : (d ?? ""));
  const on = (k: string, d = true) => (f ? f[k] === "on" : d);
  const interests = f ? (f.interests ?? "").split("|").filter(Boolean) : (defaults.interests ?? []);

  return (
    <form action={action} className="stack card">
      <div className="two">
        <Field id="profile-alias" label="Voornaam of alias" hint="Zo zien andere leden je. Je achternaam is niet nodig.">
          <input
            type="text"
            name="alias"
            required
            minLength={2}
            maxLength={30}
            autoComplete="nickname"
            defaultValue={val("alias", defaults.alias)}
          />
        </Field>
        {mode === "new" && (
          <Field
            id="profile-birth"
            label="Geboortedatum"
            hint="Alleen om te controleren dat je 18+ bent. Anderen zien hooguit je leeftijd."
          >
            <input type="date" name="birthDate" required autoComplete="bday" defaultValue={val("birthDate")} />
          </Field>
        )}
      </div>

      <Field id="profile-region" label="Regio">
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
      </Field>

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
        <legend>Interesses (optioneel, maximaal vijf)</legend>
        <div className="choices inline">
          {INTERESTS.map((i) => (
            <label key={i} className="choice">
              <input type="checkbox" name="interests" value={i} defaultChecked={interests.includes(i)} />
              <span>{i}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        id="profile-bio"
        label="Iets over jou (optioneel)"
        hint="Maximaal 200 tekens. Deel hier geen telefoonnummer, adres of andere contactgegevens."
      >
        <textarea name="bio" maxLength={200} defaultValue={val("bio", defaults.bio)} />
      </Field>

      <fieldset>
        <legend>Wat mogen andere leden zien?</legend>
        <div className="stack">
          <label className="check">
            <input type="checkbox" name="showAge" defaultChecked={on("showAge", defaults.showAge ?? true)} />
            <span>Mijn leeftijd</span>
          </label>
          <label className="check">
            <input type="checkbox" name="showRegion" defaultChecked={on("showRegion", defaults.showRegion ?? true)} />
            <span>Mijn regio</span>
          </label>
          <label className="check">
            <input type="checkbox" name="listed" defaultChecked={on("listed", defaults.listed ?? true)} />
            <span>
              Vindbaar in de ledenlijst
              <span className="hint" style={{ marginTop: 0 }}>
                Uit: je kunt nog steeds praten in de lounge, maar je staat niet in de zoekresultaten en krijgt geen nieuwe verzoeken.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {mode === "new" && (
        <label className="check">
          <input type="checkbox" name="adult" required defaultChecked={f?.adult === "on"} />
          <span>
            Ik ben 18 jaar of ouder en houd me aan de <Link href="/huisregels">huisregels</Link>.
          </span>
        </label>
      )}

      <FormError error={state?.error} success={state?.success} />
      <SubmitButton className="btn large block" pendingText="Opslaan…">
        {mode === "new" ? "Profiel opslaan" : "Wijzigingen opslaan"}
      </SubmitButton>
    </form>
  );
}
