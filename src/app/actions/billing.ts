"use server";

import { redirect } from "next/navigation";
import { openPortal, startCheckout } from "@/lib/billing/stripe";
import { getDb } from "@/lib/db";
import { type FormState, UserError, errorState } from "@/lib/errors";
import { baseUrl } from "@/lib/url";
import { caller } from "./guard";

export async function checkoutAction(_: FormState, __: FormData): Promise<FormState> {
  let url: string;
  try {
    const r = await caller();
    if (r.restricted) throw new UserError("Je account is beperkt.");
    if (!r.profile) throw new UserError("Maak eerst je profiel af.");
    url = await startCheckout(await getDb(), r.user, await baseUrl());
  } catch (err) {
    return errorState(err);
  }
  redirect(url);
}

export async function portalAction(_: FormState, __: FormData): Promise<FormState> {
  let url: string;
  try {
    const r = await caller();
    url = await openPortal(await getDb(), r.user.id, await baseUrl());
  } catch (err) {
    return errorState(err);
  }
  redirect(url);
}
