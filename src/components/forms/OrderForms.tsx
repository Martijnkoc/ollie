"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  acceptQuoteAction,
  changesAction,
  complaintAction,
  completeAction,
  declineQuoteAction,
  deliverAction,
  payAction,
  placeOrderAction,
  quoteAction,
  refundAction,
  replyAction,
  requestAction,
  requestCancelAction,
  reviewAction,
  stepOutAction,
} from "@/app/actions/orders";
import { Field, MoneyInput } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormState } from "@/lib/errors";
import { formatEuro } from "@/lib/money";

const euro = (cents: number) => formatEuro(cents);

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function Simple({
  action,
  children,
  button,
  className = "btn",
  pending,
}: {
  action: Action;
  children?: React.ReactNode;
  button: string;
  className?: string;
  pending?: string;
}) {
  const [state, act] = useActionState(action, undefined);
  if (state?.success) return <FormError success={state.success} />;
  return (
    <form action={act} className="stack">
      {children}
      <FormError error={state?.error} />
      <SubmitButton className={className} pendingText={pending}>
        {button}
      </SubmitButton>
    </form>
  );
}

function Terms({ id }: { id: string }) {
  return (
    <label className="check" htmlFor={id}>
      <input id={id} type="checkbox" name="terms" required />
      <span className="small">
        Ik ga akkoord met de{" "}
        <Link href="/voorwaarden" target="_blank">
          voorwaarden
        </Link>{" "}
        en begrijp dat ik hiermee een opdracht geef met een betaalverplichting.
      </span>
    </label>
  );
}

/* ---------- Placing ---------- */

export function PlaceOrderForm({
  serviceId,
  basePrice,
  baseDays,
  extras,
  feePercent,
  onSite,
  payable,
}: {
  serviceId: string;
  basePrice: number;
  baseDays: number;
  extras: { id: string; title: string; price_cents: number; extra_days: number }[];
  feePercent: number;
  onSite: boolean;
  payable: string | null;
}) {
  const [state, action] = useActionState(placeOrderAction.bind(null, serviceId), undefined);
  const [chosen, setChosen] = useState<string[]>([]);
  const total = useMemo(
    () => basePrice + extras.filter((e) => chosen.includes(e.id)).reduce((s, e) => s + e.price_cents, 0),
    [basePrice, extras, chosen],
  );
  const days = baseDays + extras.filter((e) => chosen.includes(e.id)).reduce((s, e) => s + e.extra_days, 0);
  const fee = Math.round((total * feePercent) / 100);
  return (
    <form action={action} className="stack-lg">
      {extras.length > 0 && (
        <fieldset>
          <legend>Uitbreidingen (optioneel)</legend>
          <div className="choices stacked">
            {extras.map((e) => (
              <label key={e.id} className="choice" style={{ justifyContent: "space-between" }}>
                <span className="row tight">
                  <input
                    type="checkbox"
                    name="extras"
                    value={e.id}
                    checked={chosen.includes(e.id)}
                    onChange={(ev) => setChosen((c) => (ev.target.checked ? [...c, e.id] : c.filter((x) => x !== e.id)))}
                  />
                  <span>
                    {e.title}
                    {e.extra_days > 0 && (
                      <span className="faint small">
                        {" "}
                        · +{e.extra_days} {e.extra_days === 1 ? "dag" : "dagen"}
                      </span>
                    )}
                  </span>
                </span>
                <strong>+ {euro(e.price_cents)}</strong>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Field
        id="order-brief"
        label="Wat moet de maker weten?"
        hint="Wensen, stijl, deadlines, links. Je kunt na het bestellen ook berichten sturen."
      >
        <textarea name="brief" maxLength={3000} defaultValue={state?.fields?.brief} />
      </Field>
      {onSite && (
        <Field id="order-location" label="Waar vindt het plaats?" hint="Plaats of adres. Alleen de maker ziet dit.">
          <input
            type="text"
            name="location"
            maxLength={120}
            required
            defaultValue={state?.fields?.location}
            autoComplete="address-level2"
          />
        </Field>
      )}
      <div className="card stack">
        <h2 style={{ fontSize: "1.15rem", margin: 0 }}>Overzicht</h2>
        <dl className="kv">
          <dt>Prijs</dt>
          <dd>{euro(total)}</dd>
          <dt>Levertijd</dt>
          <dd>
            {days} {days === 1 ? "dag" : "dagen"} na betaling
          </dd>
          <dt>Servicekosten voor jou</dt>
          <dd>€ 0</dd>
          <dt className="total">Je betaalt</dt>
          <dd className="total">{euro(total)}</dd>
        </dl>
        <p className="tiny faint" style={{ margin: 0 }}>
          Van dit bedrag gaat {euro(fee)} ({feePercent.toLocaleString("nl-NL")}%) naar Sell Yourself als platformkosten; de maker ontvangt{" "}
          {euro(total - fee)}. Het geld gaat pas naar de maker als jij de oplevering goedkeurt.
        </p>
      </div>
      {payable && <p className="notice warn small">{payable}</p>}
      <Terms id="order-terms" />
      <FormError error={state?.error} />
      <SubmitButton className="btn large block" pendingText="Bestelling plaatsen…">
        Bestellen met betaalverplichting
      </SubmitButton>
      <p className="tiny faint" style={{ margin: 0 }}>
        Na het bestellen ga je naar de betaalpagina. Je opdracht start pas als de betaling binnen is.
      </p>
    </form>
  );
}

export function RequestForm({
  username,
  serviceId,
  serviceTitle,
  needsLocation,
}: {
  username: string;
  serviceId?: string;
  serviceTitle?: string;
  needsLocation: boolean;
}) {
  const [state, action] = useActionState(requestAction.bind(null, username), undefined);
  const f = state?.fields ?? {};
  return (
    <form action={action} className="stack-lg">
      {serviceId && <input type="hidden" name="serviceId" value={serviceId} />}
      <Field id="req-title" label="Waar gaat het om?" hint="Een korte titel, bijvoorbeeld 'Logo voor mijn bakkerij'.">
        <input type="text" name="title" required minLength={5} maxLength={80} defaultValue={f.title ?? serviceTitle ?? ""} />
      </Field>
      <Field id="req-brief" label="Omschrijf je opdracht" hint="Wat wil je bereiken, wat heb je al, wat is belangrijk? Minstens 20 tekens.">
        <textarea name="brief" required minLength={20} maxLength={3000} defaultValue={f.brief} style={{ minHeight: 180 }} />
      </Field>
      <div className="two">
        <Field id="req-budget" label="Budget (optioneel)" hint="Als je het weet. Helpt de maker een passende offerte te maken.">
          <MoneyInput name="budget" defaultValue={f.budget} />
        </Field>
        <Field id="req-date" label="Gewenst klaar op (optioneel)">
          <input type="date" name="desiredBy" defaultValue={f.desiredBy} />
        </Field>
      </div>
      <Field
        id="req-location"
        label={needsLocation ? "Locatie" : "Locatie (optioneel)"}
        hint="Plaats waar het werk gebeurt, als dat relevant is."
      >
        <input type="text" name="location" maxLength={120} required={needsLocation} defaultValue={f.location} />
      </Field>
      <div className="notice small">
        Een aanvraag is vrijblijvend. De maker kan vragen stellen en stuurt een offerte. Pas als jij die accepteert, is er een afspraak.
      </div>
      <FormError error={state?.error} />
      <SubmitButton className="btn large" pendingText="Versturen…">
        Aanvraag versturen
      </SubmitButton>
    </form>
  );
}

/* ---------- Custom work ---------- */

export function QuoteForm({ orderId, feePercent }: { orderId: string; feePercent: number }) {
  const [state, action] = useActionState(quoteAction.bind(null, orderId), undefined);
  const [price, setPrice] = useState(state?.fields?.price ?? "");
  const cents = Math.round(Number(price.replace(/\./g, "").replace(",", ".")) * 100);
  const valid = Number.isFinite(cents) && cents > 0;
  if (state?.success) return <FormError success={state.success} />;
  return (
    <form action={action} className="stack">
      <div className="two">
        <Field id="q-price" label="Prijs (totaal)">
          <MoneyInput name="price" required value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field id="q-days" label="Levertijd in dagen" hint="Gerekend vanaf de betaling.">
          <input type="number" name="deliveryDays" min={1} max={365} required defaultValue={state?.fields?.deliveryDays} />
        </Field>
      </div>
      <Field id="q-message" label="Wat zit erin?" hint="Beschrijf wat de koper krijgt. Dit hoort bij de afspraak.">
        <textarea name="message" maxLength={2000} defaultValue={state?.fields?.message} />
      </Field>
      {valid && (
        <p className="small muted" style={{ margin: 0 }}>
          Je ontvangt {euro(cents - Math.round((cents * feePercent) / 100))} na {feePercent.toLocaleString("nl-NL")}% platformkosten.
        </p>
      )}
      <FormError error={state?.error} />
      <SubmitButton>Offerte versturen</SubmitButton>
    </form>
  );
}

export function AcceptQuoteForm({ orderId, quoteId, price }: { orderId: string; quoteId: string; price: number }) {
  return (
    <Simple
      action={acceptQuoteAction.bind(null, orderId, quoteId)}
      button={`Offerte accepteren met betaalverplichting (${euro(price)})`}
      className="btn block"
    >
      <Terms id={`terms-${quoteId}`} />
    </Simple>
  );
}

export function DeclineQuoteForm({ orderId, quoteId }: { orderId: string; quoteId: string }) {
  return <Simple action={declineQuoteAction.bind(null, orderId, quoteId)} button="Offerte afwijzen" className="btn ghost small" />;
}

export function StepOutForm({ orderId, role }: { orderId: string; role: "buyer" | "seller" }) {
  return (
    <Simple
      action={stepOutAction.bind(null, orderId)}
      button={role === "seller" ? "Opdracht afwijzen" : "Aanvraag intrekken"}
      className="btn danger"
    >
      <Field id={`stepout-${orderId}`} label="Toelichting (optioneel)" hint="De ander ziet deze tekst.">
        <textarea name="reason" maxLength={500} style={{ minHeight: 80 }} />
      </Field>
    </Simple>
  );
}

/* ---------- Paying and running ---------- */

export function PayForm({ orderId, price, disabledReason }: { orderId: string; price: number; disabledReason: string | null }) {
  const [state, action] = useActionState(payAction.bind(null, orderId), undefined);
  return (
    <form action={action} className="stack">
      {disabledReason && <p className="notice warn small">{disabledReason}</p>}
      <FormError error={state?.error} />
      <SubmitButton className="btn large block" pendingText="Naar de betaalpagina…">
        Betalen ({euro(price)})
      </SubmitButton>
      <p className="tiny faint" style={{ margin: 0 }}>
        Je betaalt op een beveiligde pagina van Stripe (iDEAL, creditcard). Je opdracht start zodra Stripe de betaling bevestigt.
      </p>
    </form>
  );
}

export function DeliverForm({ orderId }: { orderId: string }) {
  return (
    <Simple action={deliverAction.bind(null, orderId)} button="Opleveren">
      <Field id={`deliver-${orderId}`} label="Opleverbericht" hint="Wat lever je op, en waar vindt de koper het (bijv. een downloadlink)?">
        <textarea name="note" required minLength={5} maxLength={2000} />
      </Field>
    </Simple>
  );
}

export function ChangesForm({ orderId }: { orderId: string }) {
  return (
    <Simple action={changesAction.bind(null, orderId)} button="Om aanpassingen vragen" className="btn secondary">
      <Field id={`changes-${orderId}`} label="Wat moet er anders?">
        <textarea name="note" required minLength={10} maxLength={2000} />
      </Field>
    </Simple>
  );
}

export function CompleteForm({ orderId }: { orderId: string }) {
  return <Simple action={completeAction.bind(null, orderId)} button="Goedkeuren en afronden" className="btn block" />;
}

export function RequestCancelForm({ orderId }: { orderId: string }) {
  return (
    <Simple action={requestCancelAction.bind(null, orderId)} button="Vraag om te annuleren" className="btn secondary">
      <Field id={`cancelreq-${orderId}`} label="Waarom wil je annuleren?">
        <textarea name="reason" required minLength={5} maxLength={1000} />
      </Field>
    </Simple>
  );
}

export function RefundForm({ orderId, label }: { orderId: string; label: string }) {
  return (
    <Simple action={refundAction.bind(null, orderId)} button={label} className="btn danger">
      <Field id={`refund-${orderId}`} label="Toelichting" hint="De koper krijgt het volledige bedrag terug.">
        <textarea name="reason" maxLength={1000} style={{ minHeight: 80 }} />
      </Field>
    </Simple>
  );
}

export function ComplaintForm({ orderId }: { orderId: string }) {
  return (
    <Simple action={complaintAction.bind(null, orderId)} button="Klacht indienen" className="btn danger">
      <p className="small muted">
        Komen jullie er samen niet uit? Een moderator bekijkt de opdracht, jullie berichten en de tijdlijn, en besluit over terugbetalen of
        uitbetalen. Zolang de klacht loopt, wordt er niets automatisch afgerond.
      </p>
      <Field id={`complaint-${orderId}`} label="Wat is er aan de hand?" hint="Minstens 20 tekens.">
        <textarea name="reason" required minLength={20} maxLength={2000} />
      </Field>
    </Simple>
  );
}

export function ReviewForm({ orderId }: { orderId: string }) {
  return (
    <Simple action={reviewAction.bind(null, orderId)} button="Review plaatsen">
      <fieldset>
        <legend>Je beoordeling</legend>
        <div className="choices">
          {[5, 4, 3, 2, 1].map((n) => (
            <label key={n} className="choice">
              <input type="radio" name="rating" value={n} required />
              <span aria-label={`${n} van 5 sterren`}>{"★".repeat(n)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field id={`review-${orderId}`} label="Hoe was het?" hint="Eerlijk en concreet helpt anderen het meest. Je naam staat bij je review.">
        <textarea name="body" required minLength={10} maxLength={1500} />
      </Field>
    </Simple>
  );
}

export function ReplyForm({ reviewId }: { reviewId: string }) {
  return (
    <Simple action={replyAction.bind(null, reviewId)} button="Reactie plaatsen">
      <Field id={`reply-${reviewId}`} label="Je reactie" hint="Eén keer, openbaar zichtbaar onder de review.">
        <textarea name="reply" required minLength={2} maxLength={1000} />
      </Field>
    </Simple>
  );
}
