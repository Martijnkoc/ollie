"use server";

import { redirect } from "next/navigation";
import { checkPassword, endAdminSession, hideMember, isAdmin, markReportHandled, startAdminSession } from "@/lib/admin";
import { createEvening, createProposal, type Evening, eveningPool, getEvening, newMemberLink, setEveningStatus, toCandidate } from "@/lib/community";
import { getDb } from "@/lib/db";
import { type FormState, UserError, errorState, formFields } from "@/lib/errors";
import { suggestPairs } from "@/lib/matching";
import * as notify from "@/lib/notify";

async function guard() {
  if (!(await isAdmin())) throw new UserError("Log opnieuw in.");
}

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  if (!checkPassword(String(formData.get("password") ?? ""))) return { error: "Dat wachtwoord klopt niet." };
  await startAdminSession();
  redirect("/admin");
}

export async function logoutAction() {
  await endAdminSession();
  redirect("/admin/login");
}

export async function createEveningAction(_: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  let id: string;
  try {
    await guard();
    const evening = await createEvening(await getDb(), { region: fields.region ?? "", slot: fields.slot ?? "", day: fields.day ?? "" });
    id = evening!.id;
  } catch (err) {
    return errorState(err, fields);
  }
  redirect(`/admin/avonden/${id}`);
}

export async function eveningStatusAction(id: string, status: Evening["status"], _: FormState, __: FormData): Promise<FormState> {
  try {
    await guard();
    await setEveningStatus(await getDb(), id, status);
  } catch (err) {
    return errorState(err);
  }
  redirect(`/admin/avonden/${id}`);
}

async function proposeAndNotify(eveningId: string, a: string, b: string) {
  const db = await getDb();
  const evening = (await getEvening(db, eveningId))!;
  await createProposal(db, eveningId, a, b);
  const people = await db.query<{ id: string; first_name: string; email: string }>(`select id, first_name, email from members where id in ($1, $2)`, [a, b]);
  for (const p of people) {
    const other = people.find((x) => x.id !== p.id)!;
    await notify.proposalCreated(p.email, p.first_name, other.first_name, evening.starts_at, await newMemberLink(db, p.id));
  }
}

export async function proposeAction(eveningId: string, a: string, b: string, _: FormState, __: FormData): Promise<FormState> {
  try {
    await guard();
    await proposeAndNotify(eveningId, a, b);
  } catch (err) {
    return errorState(err);
  }
  redirect(`/admin/avonden/${eveningId}`);
}

export async function proposeAllAction(eveningId: string, _: FormState, __: FormData): Promise<FormState> {
  try {
    await guard();
    const db = await getDb();
    const evening = await getEvening(db, eveningId);
    if (!evening) throw new UserError("Onbekende avond.");
    const { members, excluded, busyIds } = await eveningPool(db, evening);
    const free = members.filter((m) => !busyIds.has(m.id)).map((m) => toCandidate(m));
    for (const [a, b] of suggestPairs(free, excluded)) await proposeAndNotify(eveningId, a.id, b.id);
  } catch (err) {
    return errorState(err);
  }
  redirect(`/admin/avonden/${eveningId}`);
}

export async function reportHandledAction(id: string, _: FormState, __: FormData): Promise<FormState> {
  try {
    await guard();
    await markReportHandled(await getDb(), id);
  } catch (err) {
    return errorState(err);
  }
  redirect("/admin/meldingen");
}

export async function hideMemberAction(id: string, back: string, _: FormState, __: FormData): Promise<FormState> {
  try {
    await guard();
    await hideMember(await getDb(), id);
  } catch (err) {
    return errorState(err);
  }
  redirect(back);
}
