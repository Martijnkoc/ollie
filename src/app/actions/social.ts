"use server";

import { block, unblock } from "@/lib/blocks";
import { getDb } from "@/lib/db";
import { type FormState, errorState, formFields } from "@/lib/errors";
import { createReport, type ReportContext } from "@/lib/moderation";
import { favorite, follow } from "@/lib/social";
import { refresh } from "next/cache";
import { caller, result } from "./guard";

export async function followAction(userId: string, on: boolean) {
  return result(async () => follow(await getDb(), await caller(), userId, on));
}

export async function favoriteAction(type: "service" | "portfolio", id: string, on: boolean) {
  return result(async () => favorite(await getDb(), await caller(), { type, id }, on));
}

export async function reportAction(context: ReportContext, contextId: string, _: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    const r = await caller();
    const db = await getDb();
    const target = await createReport(db, r, { context, contextId, reason: fields.reason ?? "", details: fields.details ?? "" });
    if (fields.block === "on") await block(db, r.user.id, target);
    return {
      success:
        fields.block === "on"
          ? "Bedankt. Een moderator bekijkt je melding, en jullie zien elkaar niet meer."
          : "Bedankt. Een moderator bekijkt je melding.",
    };
  } catch (err) {
    return errorState(err, fields);
  }
}

export async function blockAction(userId: string, _: FormState, __: FormData): Promise<FormState> {
  try {
    const r = await caller();
    await block(await getDb(), r.user.id, userId);
    refresh();
    return { success: "Geblokkeerd. Jullie zien elkaar niet meer." };
  } catch (err) {
    return errorState(err);
  }
}

export async function unblockAction(userId: string, _: FormState, __: FormData): Promise<FormState> {
  try {
    const r = await caller();
    await unblock(await getDb(), r.user.id, userId);
    refresh();
    return { success: "Gedeblokkeerd." };
  } catch (err) {
    return errorState(err);
  }
}
