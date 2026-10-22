"use client";

import { useActionState } from "react";
import { feedbackAction } from "@/app/actions/dates";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";

const Q = [
  {
    name: "comfort",
    legend: "Voelde het gesprek prettig?",
    options: [
      ["yes", "Ja"],
      ["somewhat", "Een beetje"],
      ["no", "Nee"],
    ],
  },
  {
    name: "helped",
    legend: "Heeft dit gesprek je geholpen te bepalen of je in het echt wilt afspreken?",
    options: [
      ["yes", "Ja"],
      ["somewhat", "Een beetje"],
      ["no", "Nee"],
    ],
  },
  {
    name: "next",
    legend: "Hoe wil je verder?",
    options: [
      ["meet", "Graag afspreken"],
      ["call", "Nog een keer videobellen"],
      ["no", "Liever niet"],
    ],
  },
] as const;

export function FeedbackForm({ dateId, otherName }: { dateId: string; otherName: string }) {
  const [state, action] = useActionState(feedbackAction.bind(null, dateId), undefined);
  const f = state?.fields ?? {};
  return (
    <form action={action} className="stack card">
      <div>
        <p className="eyebrow">Na jullie videodate</p>
        <h1>Hoe was het?</h1>
        <p className="muted">
          Drie korte vragen, alleen voor jou. {otherName} ziet je antwoorden niet. Alleen als jullie allebei verder willen, opent er een
          vervolg.
        </p>
      </div>
      {Q.map((q) => (
        <fieldset key={q.name}>
          <legend>{q.legend}</legend>
          <div className="choices inline">
            {q.options.map(([value, text]) => (
              <label key={value} className="choice">
                <input type="radio" name={q.name} value={value} required defaultChecked={f[q.name] === value} />
                <span>{text}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <FormError error={state?.error} />
      <SubmitButton className="btn large">Bewaar mijn antwoorden</SubmitButton>
      <p className="hint">Je antwoorden zijn definitief zodra je ze bewaart.</p>
    </form>
  );
}
