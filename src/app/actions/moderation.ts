"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { type FormState, UserError, errorState, formFields } from "@/lib/errors";
import { decideAppeal, grantRole, liftRestriction, resolveReport, restrictUser, revokeRole } from "@/lib/moderation";
import { caller } from "./guard";

async function staff() {
  const r = await caller();
  if (!r.staff) throw new UserError("Alleen voor moderatoren.");
  return r;
}

async function run(path: string, fn: () => Promise<unknown>, success: string): Promise<FormState> {
  try {
    await fn();
    revalidatePath(path);
    return { success };
  } catch (err) {
    return errorState(err);
  }
}

export async function resolveReportAction(
  reportId: string,
  outcome: "actioned" | "dismissed",
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const { resolution = "" } = formFields(formData);
  return run(
    "/beheer/meldingen",
    async () => resolveReport(await getDb(), await staff(), reportId, outcome, resolution),
    "Afgehandeld en vastgelegd.",
  );
}

export async function restrictAction(userId: string, reportId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const { reason = "" } = formFields(formData);
  return run(
    `/beheer/gebruikers/${userId}`,
    async () => restrictUser(await getDb(), await staff(), userId, reason, reportId ?? undefined),
    "Account beperkt.",
  );
}

export async function liftAction(userId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { reason = "" } = formFields(formData);
  return run(
    `/beheer/gebruikers/${userId}`,
    async () => liftRestriction(await getDb(), await staff(), userId, reason),
    "Beperking opgeheven.",
  );
}

export async function decideAppealAction(appealId: string, grant: boolean, _: FormState, formData: FormData): Promise<FormState> {
  const { response = "" } = formFields(formData);
  return run("/beheer/bezwaren", async () => decideAppeal(await getDb(), await staff(), appealId, grant, response), "Besluit vastgelegd.");
}

export async function grantRoleAction(_: FormState, formData: FormData): Promise<FormState> {
  const { email = "", role = "moderator" } = formFields(formData);
  return run(
    "/beheer/rollen",
    async () => grantRole(await getDb(), await staff(), email, role === "admin" ? "admin" : "moderator"),
    "Rol toegekend.",
  );
}

export async function revokeRoleAction(userId: string, role: "admin" | "moderator", _: FormState, __: FormData): Promise<FormState> {
  return run("/beheer/rollen", async () => revokeRole(await getDb(), await staff(), userId, role), "Rol ingetrokken.");
}
