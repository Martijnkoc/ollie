"use server";

import { redirect } from "next/navigation";
import { deleteAccount } from "@/lib/account";
import { signOut } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { type FormState, UserError, errorState, formFields } from "@/lib/errors";
import { submitAppeal } from "@/lib/moderation";
import { dashboardLink, onboardingLink } from "@/lib/payments";
import { baseUrl } from "@/lib/url";
import { caller } from "./guard";

export async function deleteAccountAction(_: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    const r = await caller();
    if ((fields.confirm ?? "").trim().toUpperCase() !== "VERWIJDER") throw new UserError("Typ VERWIJDER om te bevestigen.");
    await deleteAccount(await getDb(), r.user.id);
    await signOut();
  } catch (err) {
    return errorState(err, fields);
  }
  redirect("/?account=verwijderd");
}

export async function appealAction(_: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    await submitAppeal(await getDb(), await caller(), fields.body ?? "");
    return { success: "Je bezwaar is ontvangen. Een moderator bekijkt het en je hoort de uitkomst hier." };
  } catch (err) {
    return errorState(err, fields);
  }
}

export async function payoutOnboardingAction(_: FormState, __: FormData): Promise<FormState> {
  let url: string;
  try {
    url = await onboardingLink(await getDb(), await caller(), await baseUrl());
  } catch (err) {
    return errorState(err);
  }
  redirect(url);
}

export async function payoutDashboardAction(_: FormState, __: FormData): Promise<FormState> {
  let url: string;
  try {
    url = await dashboardLink(await getDb(), (await caller()).user.id);
  } catch (err) {
    return errorState(err);
  }
  redirect(url);
}
