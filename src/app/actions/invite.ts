"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MAX_PROPOSED_MOMENTS } from "@/lib/config";
import { getDb } from "@/lib/db";
import { type FormState, UserError, errorState, formFields } from "@/lib/errors";
import { guestCookieName } from "@/lib/guest";
import {
  acceptAlternative,
  acceptMoment,
  addMoment,
  cancelInvite,
  createInvite,
  declineAlternative,
  getInviteByCode,
  proposeAlternative,
} from "@/lib/invites";
import * as notify from "@/lib/notify";
import { parseLocal } from "@/lib/time";
import { paths } from "@/lib/url";

const name = z.string().trim().min(1, "Vul een voornaam in.").max(40, "Gebruik maximaal 40 tekens.");
const email = z.string().trim().email("Vul een geldig e-mailadres in.").max(200);
const optionalEmail = z.union([z.literal(""), email]).default("");
const adult = z.literal("on", { message: "Bevestig dat je 18 of ouder bent en de huisregels accepteert." });

function firstIssue(err: z.ZodError) {
  return new UserError(err.issues[0]?.message ?? "Controleer de gegevens.");
}

function parseMoment(value: FormDataEntryValue | null) {
  const moment = typeof value === "string" ? parseLocal(value) : null;
  if (!moment) throw new UserError("Kies een geldige datum en tijd.");
  return moment;
}

async function attempt(fn: () => Promise<unknown>): Promise<FormState | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return errorState(err);
  }
}

async function rememberGuest(code: string, token: string) {
  (await cookies()).set(guestCookieName(code), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 120,
  });
}

export async function createInviteAction(_: FormState, formData: FormData): Promise<FormState> {
  const fields = { ...formFields(formData), moment: formData.getAll("moment").join("|") };
  let hostToken: string;
  try {
    const parsed = z
      .object({ hostName: name, hostEmail: email, matchName: z.string().trim().max(40).default(""), message: z.string().trim().max(280).default(""), adult })
      .safeParse(fields);
    if (!parsed.success) throw firstIssue(parsed.error);
    const moments = formData
      .getAll("moment")
      .filter((m) => typeof m === "string" && m.trim() !== "")
      .slice(0, MAX_PROPOSED_MOMENTS)
      .map(parseMoment);
    const created = await createInvite(await getDb(), { ...parsed.data, moments });
    hostToken = created.hostToken;
    await notify.inviteCreated(parsed.data.hostEmail, parsed.data.hostName, created.hostToken, created.code);
  } catch (err) {
    return errorState(err, fields);
  }
  redirect(`${paths.manage(hostToken)}?nieuw=1`);
}

export async function acceptMomentAction(code: string, _: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  let guestToken: string;
  try {
    const parsed = z.object({ moment: z.string({ message: "Kies een moment." }).min(1, "Kies een moment."), guestName: name, guestEmail: optionalEmail, adult }).safeParse(fields);
    if (!parsed.success) throw firstIssue(parsed.error);
    const startsAt = new Date(parsed.data.moment);
    if (Number.isNaN(startsAt.getTime())) throw new UserError("Kies een moment.");
    const db = await getDb();
    const invite = await getInviteByCode(db, code);
    const result = await acceptMoment(db, { code, startsAt, guestName: parsed.data.guestName, guestEmail: parsed.data.guestEmail });
    guestToken = result.guestToken;
    await rememberGuest(code, guestToken);
    if (invite) {
      await notify.dateScheduled(
        [
          { email: invite.host_email, name: invite.host_name, otherName: parsed.data.guestName, token: result.hostToken },
          { email: parsed.data.guestEmail || null, name: parsed.data.guestName, otherName: invite.host_name, token: result.guestToken },
        ],
        startsAt,
      );
    }
  } catch (err) {
    return errorState(err, fields);
  }
  redirect(`${paths.date(guestToken)}?nieuw=1`);
}

export async function proposeAlternativeAction(code: string, _: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    const parsed = z.object({ guestName: name, guestEmail: optionalEmail, adult }).safeParse(fields);
    if (!parsed.success) throw firstIssue(parsed.error);
    const startsAt = parseMoment(formData.get("alternative"));
    const db = await getDb();
    const existing = (await cookies()).get(guestCookieName(code))?.value;
    const { guestToken } = await proposeAlternative(db, { code, startsAt, ...parsed.data, guestToken: existing });
    await rememberGuest(code, guestToken);
    const invite = await getInviteByCode(db, code);
    if (invite) await notify.alternativeProposed(invite.host_email, invite.host_name, parsed.data.guestName, startsAt, invite.host_token);
  } catch (err) {
    return errorState(err, fields);
  }
  redirect(paths.invite(code));
}

export async function acceptAlternativeAction(hostToken: string, _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => {
    const { invite, hostToken: hostDateToken, guestToken } = await acceptAlternative(await getDb(), hostToken);
    await notify.dateScheduled(
      [
        { email: invite.host_email, name: invite.host_name, otherName: invite.alt_guest_name ?? "je match", token: hostDateToken },
        { email: invite.alt_guest_email, name: invite.alt_guest_name ?? "", otherName: invite.host_name, token: guestToken },
      ],
      invite.alt_starts_at!,
    );
  });
  if (failed) return failed;
  redirect(paths.manage(hostToken));
}

export async function declineAlternativeAction(hostToken: string, _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => declineAlternative(await getDb(), hostToken));
  if (failed) return failed;
  redirect(paths.manage(hostToken));
}

export async function addMomentAction(hostToken: string, _: FormState, formData: FormData): Promise<FormState> {
  const failed = await attempt(async () => addMoment(await getDb(), hostToken, parseMoment(formData.get("moment"))));
  if (failed) return failed;
  redirect(paths.manage(hostToken));
}

export async function cancelInviteAction(hostToken: string, _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => cancelInvite(await getDb(), hostToken));
  if (failed) return failed;
  redirect(paths.manage(hostToken));
}
