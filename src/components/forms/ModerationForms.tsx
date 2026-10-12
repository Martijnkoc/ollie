"use client";

import { useActionState } from "react";
import { decideAppealAction, grantRoleAction, liftAction, resolveReportAction, restrictAction } from "@/app/actions/moderation";
import { Field } from "@/components/Field";
import { FormError } from "@/components/FormError";
import { SubmitButton } from "@/components/SubmitButton";

function Reason({ name, label, id }: { name: string; label: string; id: string }) {
  return (
    <Field id={id} label={label} hint="Wordt vastgelegd in het moderatielogboek.">
      <textarea name={name} required minLength={5} maxLength={1000} style={{ minHeight: 72 }} />
    </Field>
  );
}

export function ResolveReport({ reportId }: { reportId: string }) {
  const [a, act] = useActionState(resolveReportAction.bind(null, reportId, "actioned"), undefined);
  const [d, dismiss] = useActionState(resolveReportAction.bind(null, reportId, "dismissed"), undefined);
  if (a?.success || d?.success) return <FormError success={a?.success ?? d?.success} />;
  return (
    <div className="grid-2">
      <form action={act} className="stack">
        <Reason id={`act-${reportId}`} name="resolution" label="Afhandelen (maatregel genomen)" />
        <SubmitButton className="btn secondary">Afgehandeld</SubmitButton>
        <FormError error={a?.error} />
      </form>
      <form action={dismiss} className="stack">
        <Reason id={`dismiss-${reportId}`} name="resolution" label="Geen actie nodig" />
        <SubmitButton className="btn ghost">Afwijzen</SubmitButton>
        <FormError error={d?.error} />
      </form>
    </div>
  );
}

export function RestrictForm({ userId, reportId }: { userId: string; reportId?: string }) {
  const [state, action] = useActionState(restrictAction.bind(null, userId, reportId ?? null), undefined);
  return (
    <form action={action} className="stack">
      <Reason id={`restrict-${userId}`} name="reason" label="Reden voor beperking (de gebruiker ziet deze tekst)" />
      <SubmitButton className="btn danger">Account beperken</SubmitButton>
      <FormError error={state?.error} success={state?.success} />
    </form>
  );
}

export function LiftForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(liftAction.bind(null, userId), undefined);
  return (
    <form action={action} className="stack">
      <Reason id={`lift-${userId}`} name="reason" label="Waarom wordt de beperking opgeheven?" />
      <SubmitButton className="btn secondary">Beperking opheffen</SubmitButton>
      <FormError error={state?.error} success={state?.success} />
    </form>
  );
}

export function DecideAppeal({ appealId }: { appealId: string }) {
  const [g, grant] = useActionState(decideAppealAction.bind(null, appealId, true), undefined);
  const [r, reject] = useActionState(decideAppealAction.bind(null, appealId, false), undefined);
  if (g?.success || r?.success) return <FormError success={g?.success ?? r?.success} />;
  return (
    <div className="grid-2">
      <form action={grant} className="stack">
        <Reason id={`grant-${appealId}`} name="response" label="Toekennen (beperking vervalt)" />
        <SubmitButton className="btn secondary">Bezwaar toekennen</SubmitButton>
        <FormError error={g?.error} />
      </form>
      <form action={reject} className="stack">
        <Reason id={`reject-${appealId}`} name="response" label="Afwijzen (de gebruiker ziet deze uitleg)" />
        <SubmitButton className="btn ghost">Bezwaar afwijzen</SubmitButton>
        <FormError error={r?.error} />
      </form>
    </div>
  );
}

export function GrantRole() {
  const [state, action] = useActionState(grantRoleAction, undefined);
  return (
    <form action={action} className="stack card flat">
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
