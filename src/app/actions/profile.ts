"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { type FormState, errorState, formFields } from "@/lib/errors";
import { saveProfile } from "@/lib/profiles";
import { caller } from "./guard";

export async function saveProfileAction(next: string, _: FormState, formData: FormData): Promise<FormState> {
  const fields: Record<string, string> = { ...formFields(formData), interests: formData.getAll("interests").join("|") };
  try {
    const r = await caller();
    if (fields.adult !== "on" && !r.profile) return { error: "Bevestig dat je 18 jaar of ouder bent.", fields };
    await saveProfile(await getDb(), r.user.id, {
      alias: fields.alias ?? "",
      birthDate: fields.birthDate ?? r.profile?.birth_date ?? "",
      region: fields.region ?? "",
      intent: fields.intent ?? "",
      interests: formData.getAll("interests").map(String),
      bio: fields.bio ?? "",
      showAge: fields.showAge === "on",
      showRegion: fields.showRegion === "on",
      listed: fields.listed === "on",
    });
    if (r.profile) return { success: "Je profiel is opgeslagen.", fields };
  } catch (err) {
    return errorState(err, fields);
  }
  redirect(safeNext(next, "/lidmaatschap"));
}
