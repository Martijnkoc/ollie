"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MAX_PROPOSED_MOMENTS } from "@/lib/config";
import { getDb } from "@/lib/db";
import { type FormState, UserError, attempt, errorState, formFields } from "@/lib/errors";
import { acceptInvite, confirmGuest, createInvite, declineInvite, inviteByToken, rejectGuest, revokeInvite } from "@/lib/invites";
import * as notify from "@/lib/notify";
import { parseLocal } from "@/lib/time";
import { isTokenShaped } from "@/lib/tokens";
import { INVITE_COOKIE, inviteTokenFromCookie } from "@/lib/invite-cookie";
import { caller } from "./guard";

function parseMoment(value: FormDataEntryValue | null) {
  const moment = typeof value === "string" ? parseLocal(value) : null;
  if (!moment) throw new UserError("Kies een geldige datum en tijd.");
  return moment;
}

/** Returns the bearer token once, to be shown as a link with the token in the URL fragment. */
export async function createInviteAction(_: FormState, formData: FormData): Promise<FormState> {
  const fields: Record<string, string> = { ...formFields(formData), moment: formData.getAll("moment").join("|") };
  try {
    const moments = formData
      .getAll("moment")
      .filter((m) => typeof m === "string" && m.trim() !== "")
      .slice(0, MAX_PROPOSED_MOMENTS)
      .map(parseMoment);
    const { token } = await createInvite(await getDb(), await caller(), {
      matchName: fields.matchName ?? "",
      origin: fields.origin ?? "",
      message: fields.message ?? "",
      moments,
    });
    return { success: "Je uitnodiging staat klaar.", fields: { token } };
  } catch (err) {
    return errorState(err, fields);
  }
}

/** The guest page reads the token from the URL fragment and hands it over here, out of URLs and logs. */
export async function openInviteAction(token: string) {
  if (!isTokenShaped(token)) return { ok: false };
  const invite = await inviteByToken(await getDb(), token);
  if (!invite) return { ok: false };
  (await cookies()).set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return { ok: true };
}

export async function acceptInviteAction(_: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    const r = await caller();
    if (r.restricted) throw new UserError("Je account is beperkt.");
    const token = await inviteTokenFromCookie();
    if (!token) throw new UserError("Open de uitnodigingslink opnieuw.");
    if (fields.agree !== "on") throw new UserError("Bevestig dat je 18 jaar of ouder bent en de huisregels accepteert.");
    const moment = new Date(fields.moment ?? "");
    if (Number.isNaN(moment.getTime())) throw new UserError("Kies een moment.");
    const invite = await acceptInvite(await getDb(), r.user.id, token, { moment, name: fields.name ?? "", note: fields.note ?? "" });
    await notify.inviteAccepted(invite.organizer_id, fields.name ?? "", moment);
  } catch (err) {
    return errorState(err, fields);
  }
  redirect("/uitnodiging");
}

export async function declineInviteAction(_: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => {
    const token = await inviteTokenFromCookie();
    if (!token) throw new UserError("Open de uitnodigingslink opnieuw.");
    await declineInvite(await getDb(), token);
  });
  if (failed) return failed;
  redirect("/uitnodiging");
}

export async function confirmGuestAction(inviteId: string, _: FormState, __: FormData): Promise<FormState> {
  let dateId = "";
  const failed = await attempt(async () => {
    const r = await caller();
    const result = await confirmGuest(await getDb(), r, inviteId);
    dateId = result.dateId;
    await notify.dateScheduled(dateId);
  });
  if (failed) return failed;
  redirect(`/afspraken/${dateId}`);
}

export async function rejectGuestAction(inviteId: string, _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => rejectGuest(await getDb(), await caller(), inviteId));
  if (failed) return failed;
  redirect(`/uitnodigingen/${inviteId}`);
}

export async function revokeInviteAction(inviteId: string, _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => revokeInvite(await getDb(), await caller(), inviteId));
  if (failed) return failed;
  redirect(`/uitnodigingen/${inviteId}`);
}
