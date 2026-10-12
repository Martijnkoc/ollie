"use server";

import { redirect } from "next/navigation";
import { block, unblock } from "@/lib/blocks";
import { type ChatMessage, channelMessages, deleteMessage, getChannel, postMessage } from "@/lib/community/channels";
import {
  type ThreadMessage,
  postThreadMessage,
  respondToRequest,
  sendRequest,
  threadMessages,
  withdrawRequest,
} from "@/lib/community/contacts";
import { getDb } from "@/lib/db";
import { type FormState, UserError, attempt, errorState, formFields } from "@/lib/errors";
import { createReport } from "@/lib/moderation";
import { caller } from "./guard";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function result<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: errorState(err)!.error! };
  }
}

async function channel(slug: string) {
  const c = await getChannel(await getDb(), slug);
  if (!c) throw new UserError("Deze tafel bestaat niet.");
  return c;
}

export async function sendChannelMessage(slug: string, body: string): Promise<Result<ChatMessage[]>> {
  return result(async () => {
    const r = await caller();
    const db = await getDb();
    const c = await channel(slug);
    const id = await postMessage(db, r, c.id, body);
    return (await channelMessages(db, r, c.id, { after: id - 1 })).messages;
  });
}

export async function olderChannelMessages(slug: string, before: number) {
  return result(async () => {
    const r = await caller();
    const c = await channel(slug);
    return channelMessages(await getDb(), r, c.id, { before });
  });
}

export async function removeChannelMessage(id: number) {
  return result(async () => deleteMessage(await getDb(), await caller(), id));
}

export async function sendThreadMessage(threadId: string, body: string): Promise<Result<ThreadMessage[]>> {
  return result(async () => {
    const r = await caller();
    const db = await getDb();
    const id = await postThreadMessage(db, r, threadId, body);
    return (await threadMessages(db, r, threadId, { after: id - 1 })).messages;
  });
}

export async function olderThreadMessages(threadId: string, before: number) {
  return result(async () => threadMessages(await getDb(), await caller(), threadId, { before }));
}

export async function sendRequestAction(toId: string, _: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  try {
    await sendRequest(await getDb(), await caller(), toId, fields.message ?? "");
    return { success: "Je verzoek is verstuurd. Je hoort het als het wordt geaccepteerd." };
  } catch (err) {
    return errorState(err, fields);
  }
}

export async function respondRequestAction(requestId: string, accept: boolean, _: FormState, __: FormData): Promise<FormState> {
  let threadId: string | undefined;
  const failed = await attempt(async () => {
    threadId = await respondToRequest(await getDb(), await caller(), requestId, accept);
  });
  if (failed) return failed;
  redirect(threadId ? `/berichten/${threadId}` : "/berichten");
}

export async function withdrawRequestAction(requestId: string, _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => withdrawRequest(await getDb(), await caller(), requestId));
  if (failed) return failed;
  redirect("/berichten");
}

export async function blockAction(userId: string, back: string, _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => block(await getDb(), (await caller()).user.id, userId));
  if (failed) return failed;
  redirect(back);
}

export async function unblockAction(userId: string, _: FormState, __: FormData): Promise<FormState> {
  const failed = await attempt(async () => unblock(await getDb(), (await caller()).user.id, userId));
  if (failed) return failed;
  redirect("/account");
}

export async function reportAction(
  context: "message" | "thread_message" | "date" | "profile" | "invite",
  contextId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const fields = formFields(formData);
  try {
    const r = await caller();
    const db = await getDb();
    const target = await createReport(db, r, { context, contextId, reason: fields.reason ?? "", details: fields.details ?? "" });
    if (fields.block === "on" && target) await block(db, r.user.id, target);
    return { success: "Dank je. We bekijken je melding vertrouwelijk. De ander ziet niet dat je iets hebt gemeld." };
  } catch (err) {
    return errorState(err, fields);
  }
}
