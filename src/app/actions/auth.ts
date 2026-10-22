"use server";

import { redirect } from "next/navigation";
import { requestCode, verifyCode } from "@/lib/auth/otp";
import { safeNext, signIn, signOut } from "@/lib/auth/session";
import { getDb, one } from "@/lib/db";
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
  const target = safeNext(fields.next, "/dashboard");
  let onboarded = true;
  try {
    const db = await getDb();
    const userId = await verifyCode(db, fields.email ?? "", fields.code ?? "");
    await signIn(userId);
    onboarded = Boolean(await one(db, `select 1 from profiles where user_id = $1`, [userId]));
  } catch (err) {
    return errorState(err, { ...fields, step: "code" });
  }
  // New accounts first choose a name; then they continue where they were going.
  if (!onboarded && !target.startsWith("/welkom")) redirect(`/welkom?next=${encodeURIComponent(target)}`);
  redirect(target);
}

export async function logoutAction() {
  await signOut();
  redirect("/");
}
