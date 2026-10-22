"use client";

import { useActionState, useState } from "react";
import { saveServiceAction } from "@/app/actions/catalog";
import { Field, MoneyInput } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { MediaUpload } from "@/components/MediaUpload";
import { SubmitButton } from "@/components/SubmitButton";
import { CATEGORIES, LOCATION_MODES } from "@/lib/config";
import { formatEuro } from "@/lib/money";

export type ServiceDefaults = {
  kind: "fixed" | "custom";
  title: string;
  summary: string;
  description: string;
  category: string;
  includes: string;
  price: string;
  deliveryDays: string;
  locationMode: string;
  coverId: string | null;
  coverUrl: string | null;
  status: string;
  extras: { title: string; price: string; days: string }[];
};

export function ServiceForm({ serviceId, d, feePercent }: { serviceId: string | null; d: ServiceDefaults; feePercent: number }) {
  const [state, action] = useActionState(saveServiceAction.bind(null, serviceId), undefined);
  const f = state?.fields;
  const [kind, setKind] = useState<"fixed" | "custom">((f?.kind as "fixed" | "custom") ?? d.kind);
  const [price, setPrice] = useState(f?.price ?? d.price);
  const [extraCount, setExtraCount] = useState(Math.max(1, d.extras.length));
  const v = (k: keyof ServiceDefaults) => (f && k in f ? f[k] : String(d[k] ?? ""));
  const cents = Math.round(Number(price.replace(/\./g, "").replace(",", ".")) * 100);

  return (
    <form action={action} className="stack-lg">
      <fieldset>
        <legend>Hoe boeken klanten deze dienst?</legend>
        <div className="option-cards">
          <label className="option-card">
            <input type="radio" name="kind" value="fixed" checked={kind === "fixed"} onChange={() => setKind("fixed")} />
            <strong>Direct boeken</strong>
            <span className="small muted">Vaste prijs en levertijd. De klant bestelt en betaalt meteen.</span>
          </label>
          <label className="option-card">
            <input type="radio" name="kind" value="custom" checked={kind === "custom"} onChange={() => setKind("custom")} />
            <strong>Op aanvraag (maatwerk)</strong>
            <span className="small muted">De klant beschrijft de opdracht, jullie overleggen en jij stuurt een offerte.</span>
          </label>
        </div>
      </fieldset>

      <section className="form-section stack">
        <h2>De dienst</h2>
        <Field id="s-title" label="Titel" hint="Concreet en kort, 5 tot 80 tekens. Bijv. 'Portretshoot op locatie (1 uur)'.">
          <input type="text" name="title" required minLength={5} maxLength={80} defaultValue={v("title")} />
        </Field>
        <Field id="s-summary" label="Korte omschrijving" hint="Eén zin die in overzichten verschijnt. Max. 160 tekens.">
          <input type="text" name="summary" maxLength={160} defaultValue={v("summary")} />
        </Field>
        <div className="two">
          <Field id="s-category" label="Categorie">
            <select name="category" required defaultValue={v("category")}>
              <option value="">Kies een categorie</option>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="s-location" label="Waar lever je?">
            <select name="locationMode" defaultValue={v("locationMode")}>
              {LOCATION_MODES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          id="s-description"
          label="Omschrijving"
          hint="Wat doe je, hoe werk je, wat heb je van de klant nodig? Minimaal 30 tekens om te publiceren."
        >
          <textarea name="description" maxLength={5000} defaultValue={v("description")} style={{ minHeight: 180 }} />
        </Field>
        <Field id="s-includes" label="Wat is inbegrepen" hint="Eén punt per regel, max. 10.">
          <textarea name="includes" defaultValue={v("includes")} placeholder={"1 uur fotograferen\n20 bewerkte foto's\nOnline galerij"} />
        </Field>
        <MediaUpload
          name="coverId"
          purpose="service"
          label="Beeld bij de dienst (optioneel)"
          initialId={d.coverId}
          initialUrl={d.coverUrl}
          hint="Liggend werkt het best. JPG, PNG of WebP, max. 8 MB."
        />
      </section>

      <section className="form-section stack">
        <h2>Prijs{kind === "fixed" ? " en levertijd" : ""}</h2>
        <div className="two">
          <Field
            id="s-price"
            label={kind === "fixed" ? "Prijs" : "Vanafprijs (optioneel)"}
            hint={
              kind === "fixed"
                ? "Wat de klant betaalt, inclusief eventuele btw."
                : "Geeft klanten een indicatie. De echte prijs staat in je offerte."
            }
          >
            <MoneyInput name="price" required={kind === "fixed"} value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          {kind === "fixed" && (
            <Field id="s-days" label="Levertijd in dagen" hint="Gerekend vanaf de betaling.">
              <input type="number" name="deliveryDays" min={1} max={365} required defaultValue={v("deliveryDays")} />
            </Field>
          )}
        </div>
        {kind === "fixed" && Number.isFinite(cents) && cents > 0 && (
          <p className="small muted" style={{ margin: 0 }}>
            Je ontvangt {formatEuro(cents - Math.round((cents * feePercent) / 100))} per opdracht, na {feePercent.toLocaleString("nl-NL")}%
            platformkosten.
          </p>
        )}
        {kind === "fixed" && (
          <fieldset className="stack">
            <legend>Uitbreidingen (optioneel)</legend>
            <p className="hint" style={{ margin: 0 }}>
              Extra&apos;s die de klant kan aanvinken, bijv. &lsquo;Extra uur&rsquo; of &lsquo;Spoedlevering&rsquo;.
            </p>
            {Array.from({ length: extraCount }).map((_, i) => (
              <div key={i} className="two" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
                <Field id={`x-title-${i}`} label={`Uitbreiding ${i + 1}`}>
                  <input
                    type="text"
                    name={`extra_title_${i}`}
                    maxLength={80}
                    defaultValue={f?.[`extra_title_${i}`] ?? d.extras[i]?.title ?? ""}
                  />
                </Field>
                <Field id={`x-price-${i}`} label="Prijs (€)">
                  <input
                    type="text"
                    name={`extra_price_${i}`}
                    inputMode="decimal"
                    defaultValue={f?.[`extra_price_${i}`] ?? d.extras[i]?.price ?? ""}
                  />
                </Field>
                <Field id={`x-days-${i}`} label="Extra dagen">
                  <input
                    type="number"
                    name={`extra_days_${i}`}
                    min={0}
                    max={90}
                    defaultValue={f?.[`extra_days_${i}`] ?? d.extras[i]?.days ?? ""}
                  />
                </Field>
              </div>
            ))}
            {extraCount < 5 && (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setExtraCount((n) => n + 1)}
                style={{ justifySelf: "start" }}
              >
                + Nog een uitbreiding
              </button>
            )}
          </fieldset>
        )}
      </section>

      <section className="form-section stack">
        <FormError error={state?.error} />
        <div className="row">
          <SubmitButton className="btn large" name="intent" value="publish" pendingText="Opslaan…">
            {d.status === "published" ? "Opslaan" : "Publiceren"}
          </SubmitButton>
          <SubmitButton className="btn secondary large" name="intent" value="draft" pendingText="Opslaan…">
            Opslaan als concept
          </SubmitButton>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          Gepubliceerde diensten zijn zichtbaar zodra je profiel openbaar is. Bestaande opdrachten houden de prijs waarvoor ze zijn
          afgesproken.
        </p>
      </section>
    </form>
  );
}
