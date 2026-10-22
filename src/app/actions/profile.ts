"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { type FormState, UserError, errorState, formFields } from "@/lib/errors";
import { createProfile, updateProfile } from "@/lib/profiles";
import { caller, str } from "./guard";

export async function onboardAction(_: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  let sell = false;
  try {
    const r = await caller();
    if (fields.terms !== "on") throw new UserError("Bevestig dat je 18 jaar of ouder bent en akkoord gaat met de voorwaarden.");
    ({ sell } = await createProfile(await getDb(), r, {
      displayName: fields.displayName ?? "",
      username: fields.username ?? "",
      sell: fields.intent === "sell",
    }));
  } catch (err) {
    return errorState(err, fields);
  }
  redirect(sell ? "/dashboard/profiel?nieuw=1" : safeNext(fields.next, "/ontdek"));
}

export async function saveProfileAction(_: FormState, formData: FormData): Promise<FormState> {
  // Multi-value fields are joined so the form can restore them after React resets it.
  const fields: Record<string, string> = { ...formFields(formData), categories: formData.getAll("categories").map(str).join(",") };
  try {
    const r = await caller();
    const username = await updateProfile(await getDb(), r, {
      displayName: fields.displayName ?? "",
      username: fields.username ?? "",
      headline: fields.headline ?? "",
      bio: fields.bio ?? "",
      categories: formData.getAll("categories").map(str),
      skills: fields.skills ?? "",
      city: fields.city ?? "",
      region: fields.region ?? "",
      worksRemote: fields.worksRemote === "on",
      travelKm: fields.travelKm ?? "",
      availability: fields.availability ?? "available",
      availabilityNote: fields.availabilityNote ?? "",
      sellerType: fields.sellerType ?? "private",
      kvkNumber: fields.kvkNumber ?? "",
      website: fields.website ?? "",
      avatarId: fields.avatarId || null,
      coverId: fields.coverId || null,
      published: fields.published === "on",
    });
    refresh();
    return {
      fields,
      success:
        fields.published === "on"
          ? `Opgeslagen. Je profiel staat online op /@${username}.`
          : "Opgeslagen. Je profiel is nog niet openbaar.",
    };
  } catch (err) {
    return errorState(err, fields);
  }
}
