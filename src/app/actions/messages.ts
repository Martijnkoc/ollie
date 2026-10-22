"use server";

import { redirect } from "next/navigation";
import { getDb, one } from "@/lib/db";
import { type FormState, errorState, formFields } from "@/lib/errors";
import { type Message, getThread, markRead, postMessage, startConversation, threadMessages } from "@/lib/messages";
import { newMessageMail } from "@/lib/notify";
import { caller, result, type Result } from "./guard";

/** Mail the recipient only for the first unread message, so a conversation does not flood their inbox. */
async function maybeMail(threadId: string, authorId: string, authorName: string, messageId: number) {
  const db = await getDb();
  const t = await one<{ user_a: string; user_b: string }>(db, `select user_a, user_b from threads where id = $1`, [threadId]);
  if (!t) return;
  const to = t.user_a === authorId ? t.user_b : t.user_a;
  const earlier = await one(
    db,
    `select 1 from thread_messages m where m.thread_id = $1 and m.author_id = $2 and m.id < $3
       and m.id > coalesce((select last_read_id from thread_reads where thread_id = $1 and user_id = $4), 0)`,
    [threadId, authorId, messageId, to],
  );
  if (!earlier) await newMessageMail(to, authorName, threadId).catch(() => undefined);
}

export async function startConversationAction(userId: string, _: FormState, formData: FormData): Promise<FormState> {
  const fields = formFields(formData);
  let id: string;
  try {
    const r = await caller();
    id = await startConversation(await getDb(), r, userId, fields.body ?? "");
    await maybeMail(id, r.user.id, r.profile?.display_name ?? "Iemand", Number.MAX_SAFE_INTEGER);
  } catch (err) {
    return errorState(err, fields);
  }
  redirect(`/berichten/${id}`);
}

export async function sendMessage(threadId: string, body: string, orderId?: string): Promise<Result<Message[]>> {
  return result(async () => {
    const r = await caller();
    const db = await getDb();
    const id = await postMessage(db, r, threadId, body, orderId ?? null);
    await maybeMail(threadId, r.user.id, r.profile?.display_name ?? "Iemand", id);
    return (await threadMessages(db, r, threadId, { after: id - 1 })).messages;
  });
}

export async function olderMessages(threadId: string, before: number) {
  return result(async () => threadMessages(await getDb(), await caller(), threadId, { before }));
}

export async function markReadAction(threadId: string, lastId: number) {
  return result(async () => {
    const r = await caller();
    const db = await getDb();
    if (await getThread(db, r, threadId)) await markRead(db, r.user.id, threadId, lastId);
  });
}
