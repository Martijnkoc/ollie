"use client";

import { useActionState } from "react";
import { addPortfolioAction, updatePortfolioAction } from "@/app/actions/catalog";
import { Field } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { MediaUpload } from "@/components/MediaUpload";
import { SubmitButton } from "@/components/SubmitButton";
import { CATEGORIES } from "@/lib/config";

export function AddPortfolioForm({ defaultCategory }: { defaultCategory: string }) {
  const [state, action] = useActionState(addPortfolioAction, undefined);
  // A new key after each success gives a fresh, empty form (including the upload).
  const key = state?.fields?.reset ?? "start";
  return (
    <form key={key} action={action} className="stack card">
      <h2 style={{ fontSize: "1.2rem", margin: 0 }}>Werk toevoegen</h2>
      <MediaUpload
        name="mediaId"
        purpose="portfolio"
        label="Foto of video"
        allowVideo
        required
        hint="Foto (JPG, PNG, WebP, max. 10 MB) of video (MP4, WebM, MOV, max. 60 MB). Alleen eigen werk."
      />
      <div className="two">
        <Field id="pf-title" label="Titel">
          <input type="text" name="title" required minLength={2} maxLength={80} defaultValue={state?.error ? state.fields?.title : ""} />
        </Field>
        <Field id="pf-category" label="Categorie">
          <select name="category" required defaultValue={state?.error ? state.fields?.category : defaultCategory}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="pf-description" label="Toelichting (optioneel)" hint="Voor wie, wat was de vraag, wat heb je gedaan?">
        <textarea
          name="description"
          maxLength={1500}
          defaultValue={state?.error ? state.fields?.description : ""}
          style={{ minHeight: 90 }}
        />
      </Field>
      <label className="check small">
        <input type="checkbox" name="own" required />
        <span>Dit is mijn eigen werk, en ik heb toestemming van herkenbare personen om het te tonen.</span>
      </label>
      <FormError error={state?.error} success={state?.success} />
      <SubmitButton>Toevoegen aan portfolio</SubmitButton>
    </form>
  );
}

export function EditPortfolioForm({
  id,
  d,
}: {
  id: string;
  d: { title: string; description: string; category: string; published: boolean };
}) {
  const [state, action] = useActionState(updatePortfolioAction.bind(null, id), undefined);
  const f = state?.fields;
  return (
    <form action={action} className="stack">
      <Field id={`pe-title-${id}`} label="Titel">
        <input type="text" name="title" required maxLength={80} defaultValue={f?.title ?? d.title} />
      </Field>
      <Field id={`pe-cat-${id}`} label="Categorie">
        <select name="category" defaultValue={f?.category ?? d.category}>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`pe-desc-${id}`} label="Toelichting">
        <textarea name="description" maxLength={1500} defaultValue={f?.description ?? d.description} />
      </Field>
      <label className="check">
        <input type="checkbox" name="published" defaultChecked={f ? f.published === "on" : d.published} />
        <span>Zichtbaar op mijn profiel</span>
      </label>
      <FormError error={state?.error} success={state?.success} />
      <SubmitButton>Opslaan</SubmitButton>
    </form>
  );
}
