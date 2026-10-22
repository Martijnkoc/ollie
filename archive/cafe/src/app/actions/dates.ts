"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cancelDate, proposeDate, respondToProposal } from "@/lib/dates/core";
import { getDb } from "@/lib/db";
import { type FormState, UserError, attempt, errorState, formFields } from "@/lib/errors";
import { type Answer, type Next, shareContact, submitFeedback, withdrawContact } from "@/lib/feedback";
import * as notify from "@/lib/notify";
import { parseLocal } from "@/lib/time";
import { videoProvider } from "@/lib/video/provider";
import { caller } from "./guard";

export async function proposeDateAction(
  otherId: string,
  source: "community" | "followup",
  parentDateId: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const fields = formFields(formData);
  let dateId = "";
  try {
    const moment = parseLocal(fields.moment ?? "");
    if (!moment) throw new UserError("Kies een geldige datum en tijd.");
    dateId = await proposeDate(await getDb(), await caller(), {
      otherId,
      scheduledAt: moment,
      source,
      parentDateId: parentDateId ?? undefined,
    });
    await notify.proposalReceived(dateId);
  } catch (err) {
    return errorState(err, fields);
  }
  redirect(`/afspraken/${dateId}`);
}

export async function respondProposalAction(dateId: string, accept: boolean, _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => {
    const r = await caller();
    const outcome = await respondToProposal(await getDb(), r.user.id, dateId, accept);
    if (outcome === "scheduled") await notify.dateScheduled(dateId);
  });
  if (failed) return failed;
  redirect(`/afspraken/${dateId}`);
}

export async function cancelDateAction(dateId: string, _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => {
    const r = await caller();
    const view = await cancelDate(await getDb(), r.user.id, dateId, videoProvider());
    if (view.other.user_id) await notify.dateCancelled(view.other.user_id, view.me.display_name, view.date.scheduled_at);
  });
  if (failed) return failed;
  redirect(`/afspraken/${dateId}`);
}

export async function feedbackAction(dateId: string, _: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    const r = await caller();
    await submitFeedback(await getDb(), r.user.id, dateId, {
      comfort: fields.comfort as Answer,
      helped: fields.helped as Answer,
      next: fields.next as Next,
    });
    await notify.mutualIfAny(dateId);
  } catch (err) {
    return errorState(err, fields);
  }
  redirect(`/afspraken/${dateId}`);
}

export async function shareContactAction(dateId: string, field: string, _: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    const r = await caller();
    await shareContact(await getDb(), r.user.id, dateId, field, fields.value ?? "", fields.consent === "on");
  } catch (err) {
    return errorState(err, fields);
  }
  // Same page: revalidate so the router fetches fresh data instead of only jumping to the anchor.
  revalidatePath(`/afspraken/${dateId}`);
  redirect(`/afspraken/${dateId}#contact`);
}

export async function withdrawContactAction(dateId: string, shareId: string, _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => withdrawContact(await getDb(), (await caller()).user.id, shareId));
  if (failed) return failed;
  revalidatePath(`/afspraken/${dateId}`);
  redirect(`/afspraken/${dateId}#contact`);
}
