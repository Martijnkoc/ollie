"use server";

import { redirect } from "next/navigation";
import { requestCode, verifyCode } from "@/lib/auth/otp";
import { safeNext, signIn, signOut } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { type FormState, UserError, errorState, formFields } from "@/lib/errors";
import { clientIp } from "@/lib/url";

export async function requestCodeAction(_: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    const email = (fields.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("Vul een geldig e-mailadres in.");
    await requestCode(await getDb(), email, await clientIp());
    return { fields: { ...fields, step: "code" }, success: `We hebben een code gestuurd naar ${email}.` };
  } catch (err) {
    return errorState(err, fields);
  }
}

export async function verifyCodeAction(_: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    const userId = await verifyCode(await getDb(), fields.email ?? "", fields.code ?? "");
    await signIn(userId);
  } catch (err) {
    return errorState(err, { ...fields, step: "code" });
  }
  redirect(safeNext(fields.next, "/afspraken"));
}

export async function logoutAction() {
  await signOut();
  redirect("/");
}
