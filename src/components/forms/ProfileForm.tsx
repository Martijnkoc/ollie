"use client";

import { useActionState, useState } from "react";
import { saveProfileAction } from "@/app/actions/profile";
import { Field } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { MediaUpload } from "@/components/MediaUpload";
import { SubmitButton } from "@/components/SubmitButton";
import { AVAILABILITY, CATEGORIES, REGIONS } from "@/lib/config";

export type ProfileDefaults = {
  displayName: string;
  username: string;
  headline: string;
  bio: string;
  categories: string[];
  skills: string[];
  city: string;
  region: string;
  worksRemote: boolean;
  travelKm: string;
  availability: string;
  availabilityNote: string;
  sellerType: string;
  kvkNumber: string;
  website: string;
  avatarId: string | null;
  avatarUrl: string | null;
  coverId: string | null;
  coverUrl: string | null;
  published: boolean;
};

export function ProfileForm({ d }: { d: ProfileDefaults }) {
  const [state, action] = useActionState(saveProfileAction, undefined);
  const f = state?.fields;
  const [sellerType, setSellerType] = useState(f?.sellerType ?? d.sellerType);
  const v = (k: keyof ProfileDefaults) => (f && k in f ? f[k] : String(d[k] ?? ""));
  const checked = (k: "worksRemote" | "published") => (f ? f[k] === "on" : d[k]);
  const cats = f ? (f.categories ?? "").split(",").filter(Boolean) : d.categories;

  return (
    <form action={action} className="stack-lg">
      <section className="stack">
        <div className="two">
          <MediaUpload
            name="avatarId"
            purpose="avatar"
            label="Profielfoto"
            shape="round"
            initialId={d.avatarId}
            initialUrl={d.avatarUrl}
            hint="Een duidelijke foto van jezelf. JPG, PNG of WebP, max. 5 MB."
          />
          <MediaUpload
            name="coverId"
            purpose="cover"
            label="Omslagbeeld"
            initialId={d.coverId}
            initialUrl={d.coverUrl}
            hint="Liggend beeld van je werk. Max. 8 MB."
          />
        </div>
      </section>

      <section className="form-section stack">
        <h2>Wie je bent</h2>
        <div className="two">
          <Field id="p-name" label="Naam">
            <input type="text" name="displayName" required minLength={2} maxLength={60} defaultValue={v("displayName")} />
          </Field>
          <Field id="p-username" label="Gebruikersnaam" hint="sellyourself.nl/@gebruikersnaam">
            <input
              type="text"
              name="username"
              required
              minLength={3}
              maxLength={30}
              autoCapitalize="none"
              spellCheck={false}
              defaultValue={v("username")}
            />
          </Field>
        </div>
        <Field
          id="p-headline"
          label="Kopregel"
          hint="In één zin wat je doet. Bijv. 'Bruiloftsfotograaf in Utrecht' of 'Full-stack developer voor webshops'."
        >
          <input type="text" name="headline" maxLength={90} defaultValue={v("headline")} />
        </Field>
        <Field id="p-bio" label="Introductie" hint="Vertel wie je bent, hoe je werkt en voor wie. Max. 1500 tekens.">
          <textarea name="bio" maxLength={1500} defaultValue={v("bio")} style={{ minHeight: 160 }} />
        </Field>
      </section>

      <section className="form-section stack">
        <h2>Wat je aanbiedt</h2>
        <fieldset>
          <legend>Categorieën (max. 3)</legend>
          <div className="choices">
            {CATEGORIES.map((c) => (
              <label key={c.key} className="choice">
                <input type="checkbox" name="categories" value={c.key} defaultChecked={cats.includes(c.key)} />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field id="p-skills" label="Vaardigheden" hint="Gescheiden door komma's, max. 12. Bijv. portretfotografie, Lightroom, drone.">
          <input type="text" name="skills" defaultValue={f?.skills ?? d.skills.join(", ")} />
        </Field>
      </section>

      <section className="form-section stack">
        <h2>Waar en wanneer</h2>
        <div className="two">
          <Field id="p-city" label="Plaats">
            <input type="text" name="city" maxLength={60} autoComplete="address-level2" defaultValue={v("city")} />
          </Field>
          <Field id="p-region" label="Provincie">
            <select name="region" defaultValue={v("region")}>
              <option value="">Kies een provincie</option>
              {REGIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="two">
          <Field id="p-travel" label="Werkgebied in km (optioneel)" hint="Hoe ver je reist voor werk op locatie.">
            <input type="number" name="travelKm" min={0} max={500} inputMode="numeric" defaultValue={v("travelKm")} />
          </Field>
          <label className="check" style={{ alignSelf: "end", paddingBottom: 12 }}>
            <input type="checkbox" name="worksRemote" defaultChecked={checked("worksRemote")} />
            <span>Ik werk ook op afstand</span>
          </label>
        </div>
        <div className="two">
          <Field id="p-availability" label="Beschikbaarheid">
            <select name="availability" defaultValue={v("availability")}>
              {AVAILABILITY.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="p-availability-note" label="Toelichting (optioneel)" hint="Bijv. 'Vanaf maart weer plek' of 'Alleen weekenden'.">
            <input type="text" name="availabilityNote" maxLength={120} defaultValue={v("availabilityNote")} />
          </Field>
        </div>
      </section>

      <section className="form-section stack">
        <h2>Zakelijk</h2>
        <fieldset>
          <legend>Je verkoopt als</legend>
          <div className="choices">
            <label className="choice">
              <input
                type="radio"
                name="sellerType"
                value="private"
                checked={sellerType === "private"}
                onChange={() => setSellerType("private")}
              />
              <span>Particulier</span>
            </label>
            <label className="choice">
              <input
                type="radio"
                name="sellerType"
                value="business"
                checked={sellerType === "business"}
                onChange={() => setSellerType("business")}
              />
              <span>Zakelijk, met KvK-nummer</span>
            </label>
          </div>
        </fieldset>
        {sellerType === "business" && (
          <Field id="p-kvk" label="KvK-nummer" hint="Kopers zien dat je een zakelijke verkoper bent; dan geldt het consumentenrecht.">
            <input type="text" name="kvkNumber" inputMode="numeric" maxLength={10} required defaultValue={v("kvkNumber")} />
          </Field>
        )}
        <p className="hint" style={{ margin: 0 }}>
          Verkoop je regelmatig met winstoogmerk, dan ben je waarschijnlijk ondernemer. Twijfel je? Kijk op kvk.nl.
        </p>
        <Field id="p-website" label="Website (optioneel)">
          <input type="url" name="website" maxLength={200} inputMode="url" defaultValue={v("website")} placeholder="jouwnaam.nl" />
        </Field>
      </section>

      <section className="form-section stack">
        <label className="check">
          <input type="checkbox" name="published" defaultChecked={checked("published")} />
          <span>
            <strong>Mijn profiel is openbaar</strong>
            <br />
            <span className="small muted">Dan kan iedereen je profiel, werk en gepubliceerde diensten zien en vinden.</span>
          </span>
        </label>
        <FormError error={state?.error} success={state?.success} />
        <SubmitButton className="btn large" pendingText="Opslaan…">
          Opslaan
        </SubmitButton>
      </section>
    </form>
  );
}
