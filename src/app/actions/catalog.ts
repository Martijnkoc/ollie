"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { type FormState, UserError, errorState, formFields } from "@/lib/errors";
import { addPortfolioItem, deletePortfolioItem, updatePortfolioItem } from "@/lib/portfolio";
import { deleteService, saveService, setServiceStatus } from "@/lib/services";
import { caller, result } from "./guard";

export async function saveServiceAction(serviceId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  let id: string;
  try {
    const extras = [0, 1, 2, 3, 4].map((i) => ({
      title: fields[`extra_title_${i}`] ?? "",
      price: fields[`extra_price_${i}`] ?? "",
      days: fields[`extra_days_${i}`] ?? "",
    }));
    id = await saveService(
      await getDb(),
      await caller(),
      {
        kind: fields.kind ?? "fixed",
        title: fields.title ?? "",
        summary: fields.summary ?? "",
        description: fields.description ?? "",
        category: fields.category ?? "",
        includes: fields.includes ?? "",
        price: fields.price ?? "",
        deliveryDays: fields.deliveryDays ?? "",
        locationMode: fields.locationMode ?? "remote",
        coverId: fields.coverId || null,
        status: fields.intent === "publish" ? "published" : fields.intent === "pause" ? "paused" : "draft",
        extras,
      },
      serviceId ?? undefined,
    );
  } catch (err) {
    return errorState(err, fields);
  }
  redirect(`/dashboard/diensten?opgeslagen=${id}`);
}

export async function serviceStatusAction(serviceId: string, status: "published" | "paused" | "draft") {
  return result(async () => {
    await setServiceStatus(await getDb(), await caller(), serviceId, status);
    refresh();
  });
}

export async function deleteServiceAction(serviceId: string) {
  return result(async () => {
    await deleteService(await getDb(), await caller(), serviceId);
    refresh();
  });
}

export async function addPortfolioAction(_: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    if (fields.own !== "on") throw new UserError("Bevestig dat dit je eigen werk is en dat je toestemming hebt om het te tonen.");
    await addPortfolioItem(await getDb(), await caller(), {
      title: fields.title ?? "",
      description: fields.description ?? "",
      category: fields.category ?? "",
      mediaId: fields.mediaId || null,
    });
    refresh();
    return { success: "Toegevoegd aan je portfolio.", fields: { reset: String(Date.now()) } };
  } catch (err) {
    return errorState(err, fields);
  }
}

export async function updatePortfolioAction(itemId: string, _: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    await updatePortfolioItem(await getDb(), await caller(), itemId, {
      title: fields.title ?? "",
      description: fields.description ?? "",
      category: fields.category ?? "",
      published: fields.published === "on",
    });
    refresh();
    return { success: "Opgeslagen.", fields };
  } catch (err) {
    return errorState(err, fields);
  }
}

export async function deletePortfolioAction(itemId: string) {
  return result(async () => {
    await deletePortfolioItem(await getDb(), await caller(), itemId);
    refresh();
  });
}
