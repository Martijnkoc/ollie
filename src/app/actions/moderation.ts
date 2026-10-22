"use server";

import { refresh } from "next/cache";
import { getDb } from "@/lib/db";
import { type FormState, UserError, errorState, formFields } from "@/lib/errors";
import {
  decideAppeal,
  grantRole,
  hideContent,
  liftRestriction,
  resolveReport,
  restrictUser,
  revokeRole,
  unhideContent,
} from "@/lib/moderation";
import { orderMail } from "@/lib/notify";
import { resolveDispute } from "@/lib/payments";
import { caller } from "./guard";

async function staff() {
  const r = await caller();
  if (!r.staff) throw new UserError("Alleen voor moderatoren.");
  return r;
}

async function run(fn: () => Promise<unknown>, success: string): Promise<FormState> {
  try {
    await fn();
    refresh();
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
  return run(async () => resolveReport(await getDb(), await staff(), reportId, outcome, resolution), "Afgehandeld en vastgelegd.");
}

export async function restrictAction(userId: string, reportId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const { reason = "" } = formFields(formData);
  return run(async () => restrictUser(await getDb(), await staff(), userId, reason, reportId ?? undefined), "Account beperkt.");
}

export async function liftAction(userId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { reason = "" } = formFields(formData);
  return run(async () => liftRestriction(await getDb(), await staff(), userId, reason), "Beperking opgeheven.");
}

export async function hideAction(
  context: "profile" | "service" | "portfolio" | "review",
  id: string,
  hide: boolean,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const { reason = "" } = formFields(formData);
  return run(
    async () =>
      hide
        ? hideContent(await getDb(), await staff(), context, id, reason)
        : unhideContent(await getDb(), await staff(), context, id, reason),
    hide ? "Verborgen en vastgelegd." : "Weer zichtbaar.",
  );
}

export async function featureAction(userId: string, on: boolean, _: FormState, __: FormData): Promise<FormState> {
  return run(
    async () => {
      const r = await staff();
      const db = await getDb();
      await db.query(`update profiles set featured_at = ${on ? "now()" : "null"} where user_id = $1 and published`, [userId]);
      await db.query(`insert into moderation_actions (actor_id, target_id, action, reason) values ($1, $2, $3, 'redactionele keuze')`, [
        r.user.id,
        userId,
        on ? "feature" : "unfeature",
      ]);
    },
    on ? "Uitgelicht op de homepage." : "Niet meer uitgelicht.",
  );
}

export async function decideAppealAction(appealId: string, grant: boolean, _: FormState, formData: FormData): Promise<FormState> {
  const { response = "" } = formFields(formData);
  return run(async () => decideAppeal(await getDb(), await staff(), appealId, grant, response), "Besluit vastgelegd.");
}

export async function grantRoleAction(_: FormState, formData: FormData): Promise<FormState> {
  const { email = "", role = "moderator" } = formFields(formData);
  return run(async () => grantRole(await getDb(), await staff(), email, role === "admin" ? "admin" : "moderator"), "Rol toegekend.");
}

export async function revokeRoleAction(userId: string, role: "admin" | "moderator", _: FormState, __: FormData): Promise<FormState> {
  return run(async () => revokeRole(await getDb(), await staff(), userId, role), "Rol ingetrokken.");
}

export async function resolveDisputeAction(
  orderId: string,
  outcome: "refund" | "release" | "resume",
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const { note = "" } = formFields(formData);
  const out = await run(async () => resolveDispute(await getDb(), await staff(), orderId, outcome, note), "Besluit vastgelegd.");
  if (out?.success && outcome === "refund") await orderMail(orderId, "refunded").catch(() => undefined);
  return out;
}
