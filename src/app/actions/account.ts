"use server";

import { redirect } from "next/navigation";
import { deleteAccount } from "@/lib/account";
import { signOut } from "@/lib/auth/session";
import { cancelImmediately } from "@/lib/billing/stripe";
import { getDb } from "@/lib/db";
import { type FormState, UserError, errorState, formFields } from "@/lib/errors";
import { submitAppeal } from "@/lib/moderation";
import { caller } from "./guard";

export async function deleteAccountAction(_: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    const r = await caller();
    if ((fields.confirm ?? "").trim().toUpperCase() !== "VERWIJDER") throw new UserError("Typ VERWIJDER om te bevestigen.");
    const db = await getDb();
    // Stop billing first; if that fails we keep the account so nothing is charged without an account.
    if (r.membership?.stripe_subscription_id && r.membership.status !== "canceled") {
      try {
        await cancelImmediately(r.membership.stripe_subscription_id);
      } catch {
        throw new UserError("We konden je abonnement nu niet stopzetten. Probeer het later opnieuw of neem contact op.");
      }
    }
    await deleteAccount(db, r.user.id);
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
