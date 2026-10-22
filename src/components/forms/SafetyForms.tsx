"use client";

import { useActionState } from "react";
import { blockAction, reportAction } from "@/app/actions/social";
import { Field } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";
import { REPORT_REASONS } from "@/lib/config";
import type { ReportContext } from "@/lib/moderation";

export function ReportForm({
  context,
  contextId,
  name,
  allowBlock = true,
}: {
  context: ReportContext;
  contextId: string;
  name?: string;
  allowBlock?: boolean;
}) {
  const [state, action] = useActionState(reportAction.bind(null, context, contextId), undefined);
  if (state?.success) return <FormError success={state.success} />;
  const f = state?.fields ?? {};
  return (
    <form action={action} className="stack">
      <fieldset>
        <legend>Wat is er aan de hand?</legend>
        <div className="choices stacked">
          {REPORT_REASONS.map((r) => (
            <label key={r.key} className="choice">
              <input type="radio" name="reason" value={r.key} required defaultChecked={f.reason === r.key} />
              <span>{r.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field id={`report-${context}-${contextId}`} label="Toelichting (optioneel)">
        <textarea name="details" maxLength={2000} defaultValue={f.details} />
      </Field>
      {allowBlock && (
        <label className="check">
          <input type="checkbox" name="block" />
          <span>Blokkeer {name ?? "deze persoon"} ook</span>
        </label>
      )}
      <FormError error={state?.error} />
      <SubmitButton className="btn danger">Melding versturen</SubmitButton>
      <p className="hint">Een moderator bekijkt je melding. De ander ziet niet dat je iets hebt gemeld.</p>
    </form>
  );
}

export function BlockForm({ userId, name }: { userId: string; name: string }) {
  const [state, action] = useActionState(blockAction.bind(null, userId), undefined);
  if (state?.success) return <FormError success={state.success} />;
  return (
    <form action={action} className="stack">
      <p>
        Jullie zien elkaar niet meer en kunnen elkaar geen berichten sturen. Openstaande aanvragen en offertes tussen jullie stoppen. Een
        betaalde opdracht loopt door, zodat niemand geld of een oplevering kwijtraakt. {name} krijgt hier geen bericht over.
      </p>
      <FormError error={state?.error} />
      <SubmitButton className="btn danger">{name} blokkeren</SubmitButton>
    </form>
  );
}
