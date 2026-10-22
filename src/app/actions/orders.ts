"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { type FormState, UserError, errorState, formFields } from "@/lib/errors";
import { orderMail } from "@/lib/notify";
import {
  acceptQuote,
  complete,
  createFixedOrder,
  createRequest,
  declineQuote,
  deliver,
  openComplaint,
  requestCancel,
  requestChanges,
  sendQuote,
  stepOut,
} from "@/lib/orders";
import { expireCheckout, refundOrder, releaseFunds, startCheckout } from "@/lib/payments";
import { profileByUsername } from "@/lib/profiles";
import { replyToReview, writeReview } from "@/lib/reviews";
import { baseUrl } from "@/lib/url";
import { caller, str } from "./guard";

/** Runs an order mutation, sends the matching e-mail and refreshes the page. */
async function run(
  orderId: string,
  kind: string,
  fn: () => Promise<unknown>,
  success: string,
  fields?: Record<string, string>,
): Promise<FormState> {
  try {
    await fn();
  } catch (err) {
    return errorState(err, fields);
  }
  try {
    await orderMail(orderId, kind);
  } catch (err) {
    console.error(`[mail] order notification failed: ${err instanceof Error ? err.message : err}`);
  }
  refresh();
  return { success };
}

export async function placeOrderAction(serviceId: string, _: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  let id: string;
  try {
    id = await createFixedOrder(await getDb(), await caller(), {
      serviceId,
      extraIds: formData.getAll("extras").map(str),
      brief: fields.brief ?? "",
      location: fields.location ?? "",
      acceptTerms: fields.terms === "on",
    });
  } catch (err) {
    return errorState(err, fields);
  }
  await orderMail(id, "ordered").catch(() => undefined);
  redirect(`/opdrachten/${id}?nieuw=1`);
}

export async function requestAction(username: string, _: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  let id: string;
  try {
    const r = await caller();
    const db = await getDb();
    const seller = await profileByUsername(db, username, r.user.id);
    if (!seller) throw new UserError("Deze maker is niet beschikbaar.");
    id = await createRequest(db, r, {
      sellerId: seller.user_id,
      serviceId: fields.serviceId || undefined,
      title: fields.title ?? "",
      brief: fields.brief ?? "",
      budget: fields.budget ?? "",
      desiredBy: fields.desiredBy ?? "",
      location: fields.location ?? "",
    });
  } catch (err) {
    return errorState(err, fields);
  }
  await orderMail(id, "requested").catch(() => undefined);
  redirect(`/opdrachten/${id}?nieuw=1`);
}

export async function quoteAction(orderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const f = formFields(formData);
  return run(
    orderId,
    "quoted",
    async () =>
      sendQuote(await getDb(), await caller(), orderId, {
        price: f.price ?? "",
        deliveryDays: f.deliveryDays ?? "",
        message: f.message ?? "",
      }),
    "Offerte verstuurd.",
    f,
  );
}

export async function acceptQuoteAction(orderId: string, quoteId: string, _: FormState, formData: FormData): Promise<FormState> {
  const f = formFields(formData);
  return run(
    orderId,
    "quote_accepted",
    async () => acceptQuote(await getDb(), await caller(), orderId, quoteId, f.terms === "on"),
    "Offerte geaccepteerd.",
  );
}

export async function declineQuoteAction(orderId: string, quoteId: string, _: FormState, __: FormData): Promise<FormState> {
  return run(orderId, "quote_declined", async () => declineQuote(await getDb(), await caller(), orderId, quoteId), "Offerte afgewezen.");
}

export async function stepOutAction(orderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const f = formFields(formData);
  try {
    const out = await stepOut(await getDb(), await caller(), orderId, f.reason ?? "");
    await expireCheckout(out.checkoutSession);
    await orderMail(orderId, out.status).catch(() => undefined);
  } catch (err) {
    return errorState(err, f);
  }
  refresh();
  return { success: "Gestopt. Er is niets betaald." };
}

export async function payAction(orderId: string, _: FormState, __: FormData): Promise<FormState> {
  let url: string;
  try {
    url = await startCheckout(await getDb(), await caller(), orderId, await baseUrl());
  } catch (err) {
    return errorState(err);
  }
  redirect(url);
}

export async function deliverAction(orderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const f = formFields(formData);
  return run(
    orderId,
    "delivered",
    async () => deliver(await getDb(), await caller(), orderId, f.note ?? ""),
    "Opgeleverd. De koper krijgt bericht.",
    f,
  );
}

export async function changesAction(orderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const f = formFields(formData);
  return run(
    orderId,
    "changes_requested",
    async () => requestChanges(await getDb(), await caller(), orderId, f.note ?? ""),
    "Verstuurd.",
    f,
  );
}

export async function completeAction(orderId: string, _: FormState, __: FormData): Promise<FormState> {
  return run(
    orderId,
    "completed",
    async () => {
      const db = await getDb();
      await complete(db, await caller(), orderId);
      await releaseFunds(db, orderId);
    },
    "Afgerond. Bedankt!",
  );
}

export async function requestCancelAction(orderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const f = formFields(formData);
  return run(
    orderId,
    "cancel_requested",
    async () => requestCancel(await getDb(), await caller(), orderId, f.reason ?? ""),
    "Je verzoek is verstuurd.",
    f,
  );
}

export async function refundAction(orderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const f = formFields(formData);
  return run(
    orderId,
    "refunded",
    async () => refundOrder(await getDb(), await caller(), orderId, f.reason ?? ""),
    "Geannuleerd. Het bedrag gaat terug naar de koper.",
    f,
  );
}

export async function complaintAction(orderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const f = formFields(formData);
  return run(
    orderId,
    "disputed",
    async () => openComplaint(await getDb(), await caller(), orderId, f.reason ?? ""),
    "Je klacht is ingediend. Een moderator kijkt mee.",
    f,
  );
}

export async function reviewAction(orderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const f = formFields(formData);
  return run(
    orderId,
    "review",
    async () => writeReview(await getDb(), await caller(), orderId, { rating: Number(f.rating), body: f.body ?? "" }),
    "Bedankt voor je review.",
    f,
  );
}

export async function replyAction(reviewId: string, _: FormState, formData: FormData): Promise<FormState> {
  const f = formFields(formData);
  try {
    await replyToReview(await getDb(), await caller(), reviewId, f.reply ?? "");
    refresh();
    return { success: "Je reactie staat online." };
  } catch (err) {
    return errorState(err, f);
  }
}
