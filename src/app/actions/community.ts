"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { GENDERS, INTENTS, MIN_AGE, REGIONS, SLOTS } from "@/lib/config";
import {
  type MemberInput,
  deleteMember,
  getMemberByToken,
  joinCafeWaitlist,
  linkForEmail,
  respondToProposal,
  setVisible,
  signUp,
  updateMember,
} from "@/lib/community";
import { getDb } from "@/lib/db";
import { type FormState, UserError, errorState, formFields } from "@/lib/errors";
import * as notify from "@/lib/notify";
import { paths } from "@/lib/url";

const keys = <T extends { key: string }>(list: readonly T[]) => list.map((i) => i.key) as [string, ...string[]];

const profileSchema = z
  .object({
    firstName: z.string().trim().min(1, "Vul je voornaam in.").max(40),
    gender: z.enum(keys(GENDERS), { message: "Kies wat bij je past onder 'Ik ben'." }),
    lookingFor: z.array(z.enum(keys(GENDERS))).min(1, "Kies wie je wilt leren kennen."),
    ageMin: z.coerce.number().int().min(MIN_AGE, `De minimumleeftijd is ${MIN_AGE}.`).max(99),
    ageMax: z.coerce.number().int().min(MIN_AGE).max(99),
    region: z.enum(keys(REGIONS), { message: "Kies je regio." }),
    intent: z.enum(keys(INTENTS), { message: "Kies wat je zoekt." }),
    about: z.string().trim().max(140, "Houd het bij één zin (max. 140 tekens).").default(""),
    slots: z.array(z.enum(keys(SLOTS))).default([]),
    visible: z.boolean(),
  })
  .refine((v) => v.ageMax >= v.ageMin, { message: "De maximumleeftijd moet hoger zijn dan de minimumleeftijd." });

function readProfile(formData: FormData) {
  const fields = formFields(formData);
  const parsed = profileSchema.safeParse({
    ...fields,
    lookingFor: formData.getAll("lookingFor"),
    slots: formData.getAll("slots"),
    visible: fields.visible === "on",
  });
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  return parsed.data as Omit<MemberInput, "email" | "birthDate">;
}

function refill(formData: FormData): Record<string, string> {
  return { ...formFields(formData), lookingFor: formData.getAll("lookingFor").join("|"), slots: formData.getAll("slots").join("|") };
}

export async function signUpAction(_: FormState, formData: FormData): Promise<FormState> {
  const fields = refill(formData);
  let token: string;
  try {
    const profile = readProfile(formData);
    const extra = z
      .object({
        email: z.string().trim().email("Vul een geldig e-mailadres in."),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Vul je geboortedatum in."),
        adult: z.literal("on", { message: "Bevestig dat je 18 of ouder bent en de huisregels accepteert." }),
      })
      .safeParse(fields);
    if (!extra.success) throw new UserError(extra.error.issues[0].message);
    const result = await signUp(await getDb(), {
      ...profile,
      email: extra.data.email,
      birthDate: extra.data.birthDate,
      source: fields.van === "date" ? "na-date" : "direct",
    });
    await notify.memberLink(result.email, profile.firstName, result.token, result.status === "created");
    if (result.status === "exists") {
      return { error: undefined, fields: { ...fields, sent: "1" } };
    }
    token = result.token;
  } catch (err) {
    return errorState(err, fields);
  }
  redirect(`${paths.profile(token)}?welkom=1`);
}

async function member(token: string) {
  const m = await getMemberByToken(await getDb(), token);
  if (!m) throw new UserError("Deze link klopt niet (meer).");
  return m;
}

export async function updateProfileAction(token: string, _: FormState, formData: FormData): Promise<FormState> {
  const fields = refill(formData);
  try {
    const m = await member(token);
    await updateMember(await getDb(), m.id, readProfile(formData));
  } catch (err) {
    return errorState(err, fields);
  }
  redirect(`${paths.profile(token)}?opgeslagen=1`);
}

export async function setVisibleAction(token: string, visible: boolean, _: FormState, __: FormData): Promise<FormState> {
  try {
    const m = await member(token);
    await setVisible(await getDb(), m.id, visible);
  } catch (err) {
    return errorState(err);
  }
  redirect(paths.profile(token));
}

export async function respondAction(token: string, proposalId: string, response: "accepted" | "declined", _: FormState, __: FormData): Promise<FormState> {
  try {
    const m = await member(token);
    const result = await respondToProposal(await getDb(), m.id, proposalId, response);
    if (result.scheduled) {
      const [a, b] = result.participants;
      await notify.dateScheduled(
        [
          { email: a.email, name: a.first_name, otherName: b.first_name, token: a.token },
          { email: b.email, name: b.first_name, otherName: a.first_name, token: b.token },
        ],
        result.startsAt,
      );
    }
  } catch (err) {
    return errorState(err);
  }
  redirect(paths.profile(token));
}

export async function deleteProfileAction(token: string, _: FormState, __: FormData): Promise<FormState> {
  try {
    const m = await member(token);
    await deleteMember(await getDb(), m.id);
  } catch (err) {
    return errorState(err);
  }
  redirect("/tot-ziens");
}

export async function waitlistAction(_: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    const parsed = z
      .object({
        firstName: z.string().trim().min(1, "Vul je voornaam in.").max(40),
        email: z.string().trim().email("Vul een geldig e-mailadres in."),
        region: z.enum(keys(REGIONS), { message: "Kies je regio." }),
      })
      .safeParse(fields);
    if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
    await joinCafeWaitlist(await getDb(), parsed.data);
  } catch (err) {
    return errorState(err, fields);
  }
  return { fields: { done: "1" } };
}

/** Always answers the same, so nobody can find out which addresses we know. */
export async function lostLinkAction(_: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    const email = z.string().trim().toLowerCase().email("Vul een geldig e-mailadres in.").safeParse(fields.email);
    if (!email.success) throw new UserError(email.error.issues[0].message);
    const db = await getDb();
    const m = await linkForEmail(db, email.data);
    if (m) await notify.memberLink(email.data, m.firstName, m.token, false);
    const invites = await db.query<{ host_name: string; host_token: string; code: string }>(
      `select host_name, host_token, code from invites where host_email = $1 and status <> 'cancelled' and created_at > now() - interval '60 days'`,
      [email.data],
    );
    for (const i of invites) await notify.inviteCreated(email.data, i.host_name, i.host_token, i.code);
    const dates = await db.query<{ first_name: string; token: string; starts_at: Date; other: string }>(
      `select p.first_name, p.token, d.starts_at, o.first_name as other
       from participants p join dates d on d.id = p.date_id join participants o on o.date_id = p.date_id and o.id <> p.id
       where p.email = $1 and p.role = 'guest' and d.starts_at > now() - interval '14 days'`,
      [email.data],
    );
    for (const d of dates) {
      await notify.dateScheduled([{ email: email.data, name: d.first_name, otherName: d.other, token: d.token }], d.starts_at);
    }
  } catch (err) {
    return errorState(err, fields);
  }
  return { fields: { done: "1" } };
}
