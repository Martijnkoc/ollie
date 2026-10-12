"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { REPORT_REASONS } from "@/lib/config";
import { blockOther, cancelDate, decide, reportOther, setHelped, shareContact, withdrawContact } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { type FormState, UserError, errorState, formFields } from "@/lib/errors";
import * as notify from "@/lib/notify";
import { paths } from "@/lib/url";

async function attempt(fn: () => Promise<unknown>): Promise<FormState | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return errorState(err);
  }
}

export async function cancelDateAction(token: string, _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => {
    const view = await cancelDate(await getDb(), token);
    await notify.dateCancelled(view.other.email, view.other.first_name, view.me.first_name, view.date.starts_at);
  });
  if (failed) return failed;
  redirect(paths.date(token));
}

export async function decideAction(token: string, decision: "yes" | "no", _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => {
    const view = await decide(await getDb(), token, decision);
    if (view.outcome === "mutual") {
      await notify.mutualInterest([
        { email: view.me.email, name: view.me.first_name, otherName: view.other.first_name, token: view.me.token },
        { email: view.other.email, name: view.other.first_name, otherName: view.me.first_name, token: view.other.token },
      ]);
    }
  });
  if (failed) return failed;
  redirect(`${paths.date(token)}?keuze=1`);
}

export async function helpedAction(token: string, helped: "yes" | "somewhat" | "no", _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => setHelped(await getDb(), token, helped));
  if (failed) return failed;
  redirect(`${paths.date(token)}?keuze=1`);
}

export async function shareContactAction(token: string, _: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    if (fields.consent !== "on") throw new UserError("Bevestig dat je deze gegevens wilt delen.");
    await shareContact(await getDb(), token, fields.contact ?? "");
  } catch (err) {
    return errorState(err, fields);
  }
  redirect(`${paths.date(token)}?keuze=1`);
}

export async function withdrawContactAction(token: string, _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => withdrawContact(await getDb(), token));
  if (failed) return failed;
  redirect(`${paths.date(token)}?keuze=1`);
}

export async function blockAction(token: string, _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => blockOther(await getDb(), token));
  if (failed) return failed;
  redirect(paths.date(token));
}

const reasonKeys = REPORT_REASONS.map((r) => r.key) as [string, ...string[]];

export async function reportAction(token: string, _: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    const parsed = z.object({ reason: z.enum(reasonKeys, { message: "Kies een reden." }), details: z.string().max(2000).default("") }).safeParse(fields);
    if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
    await reportOther(await getDb(), token, { ...parsed.data, block: fields.block === "on" });
  } catch (err) {
    return errorState(err, fields);
  }
  redirect(`${paths.date(token)}?gemeld=1`);
}
