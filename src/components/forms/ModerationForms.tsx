"use client";

import { useActionState } from "react";
import {
  decideAppealAction,
  featureAction,
  grantRoleAction,
  hideAction,
  liftAction,
  resolveDisputeAction,
  resolveReportAction,
  restrictAction,
  revokeRoleAction,
} from "@/app/actions/moderation";
import { Field } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormState } from "@/lib/errors";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function Reason({ name, label, id }: { name: string; label: string; id: string }) {
  return (
    <Field id={id} label={label} hint="Wordt vastgelegd in het logboek.">
      <textarea name={name} required minLength={5} maxLength={1000} style={{ minHeight: 72 }} />
    </Field>
  );
}

function ReasonForm({
  action,
  id,
  name,
  label,
  button,
  className = "btn secondary",
}: {
  action: Action;
  id: string;
  name: string;
  label: string;
  button: string;
  className?: string;
}) {
  const [state, act] = useActionState(action, undefined);
  if (state?.success) return <FormError success={state.success} />;
  return (
    <form action={act} className="stack">
      <Reason id={id} name={name} label={label} />
      <SubmitButton className={className}>{button}</SubmitButton>
      <FormError error={state?.error} />
    </form>
  );
}

export function ResolveReport({ reportId }: { reportId: string }) {
  return (
    <div className="grid-2">
      <ReasonForm
        action={resolveReportAction.bind(null, reportId, "actioned")}
        id={`act-${reportId}`}
        name="resolution"
        label="Afhandelen (maatregel genomen)"
        button="Afgehandeld"
      />
      <ReasonForm
        action={resolveReportAction.bind(null, reportId, "dismissed")}
        id={`dismiss-${reportId}`}
        name="resolution"
        label="Geen actie nodig"
        button="Afwijzen"
        className="btn ghost"
      />
    </div>
  );
}

export function HideForm({ context, id, hide }: { context: "profile" | "service" | "portfolio" | "review"; id: string; hide: boolean }) {
  return (
    <ReasonForm
      action={hideAction.bind(null, context, id, hide)}
      id={`hide-${context}-${id}`}
      name="reason"
      label={hide ? "Reden om te verbergen (de eigenaar ziet deze tekst)" : "Waarom weer zichtbaar?"}
      button={hide ? "Verbergen" : "Weer zichtbaar maken"}
      className={hide ? "btn danger" : "btn secondary"}
    />
  );
}

export function RestrictForm({ userId, reportId }: { userId: string; reportId?: string }) {
  return (
    <ReasonForm
      action={restrictAction.bind(null, userId, reportId ?? null)}
      id={`restrict-${userId}`}
      name="reason"
      label="Reden voor beperking (de gebruiker ziet deze tekst)"
      button="Account beperken"
      className="btn danger"
    />
  );
}

export function LiftForm({ userId }: { userId: string }) {
  return (
    <ReasonForm
      action={liftAction.bind(null, userId)}
      id={`lift-${userId}`}
      name="reason"
      label="Waarom wordt de beperking opgeheven?"
      button="Beperking opheffen"
    />
  );
}

export function FeatureForm({ userId, featured }: { userId: string; featured: boolean }) {
  const [state, act] = useActionState(featureAction.bind(null, userId, !featured), undefined);
  return (
    <form action={act} className="stack-sm">
      <SubmitButton className="btn secondary small">{featured ? "Niet meer uitlichten" : "Uitlichten op de homepage"}</SubmitButton>
      <FormError error={state?.error} success={state?.success} />
    </form>
  );
}

export function DecideAppeal({ appealId }: { appealId: string }) {
  return (
    <div className="grid-2">
      <ReasonForm
        action={decideAppealAction.bind(null, appealId, true)}
        id={`grant-${appealId}`}
        name="response"
        label="Toekennen (beperking vervalt)"
        button="Bezwaar toekennen"
      />
      <ReasonForm
        action={decideAppealAction.bind(null, appealId, false)}
        id={`reject-${appealId}`}
        name="response"
        label="Afwijzen (de gebruiker ziet deze uitleg)"
        button="Bezwaar afwijzen"
        className="btn ghost"
      />
    </div>
  );
}

export function ResolveDispute({ orderId, paid }: { orderId: string; paid: boolean }) {
  return (
    <div className="grid-3">
      <ReasonForm
        action={resolveDisputeAction.bind(null, orderId, "refund")}
        id={`refund-${orderId}`}
        name="note"
        label={paid ? "Terugbetalen aan de koper" : "Opdracht stoppen"}
        button={paid ? "Terugbetalen" : "Stoppen"}
        className="btn danger"
      />
      <ReasonForm
        action={resolveDisputeAction.bind(null, orderId, "release")}
        id={`release-${orderId}`}
        name="note"
        label="Afronden en uitbetalen aan de maker"
        button="Uitbetalen"
      />
      <ReasonForm
        action={resolveDisputeAction.bind(null, orderId, "resume")}
        id={`resume-${orderId}`}
        name="note"
        label="Opdracht laten doorlopen"
        button="Laten doorlopen"
        className="btn ghost"
      />
    </div>
  );
}

export function GrantRole() {
  const [state, action] = useActionState(grantRoleAction, undefined);
  return (
    <form action={action} className="stack card">
      <div className="two">
        <Field id="role-email" label="E-mailadres">
          <input type="email" name="email" required />
        </Field>
        <Field id="role-role" label="Rol">
          <select name="role" defaultValue="moderator">
            <option value="moderator">Moderator</option>
            <option value="admin">Beheerder</option>
          </select>
        </Field>
      </div>
      <SubmitButton>Rol toekennen</SubmitButton>
      <FormError error={state?.error} success={state?.success} />
    </form>
  );
}

export function RevokeRole({ userId, role }: { userId: string; role: "admin" | "moderator" }) {
  const [state, action] = useActionState(revokeRoleAction.bind(null, userId, role), undefined);
  return (
    <form action={action}>
      <SubmitButton className="btn ghost small">Intrekken</SubmitButton>
      <FormError error={state?.error} success={state?.success} />
    </form>
  );
}
