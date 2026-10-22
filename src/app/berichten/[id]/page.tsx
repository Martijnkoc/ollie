import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatRoom } from "@/components/ChatRoom";
import { requireActive } from "@/lib/access";
import { getDb } from "@/lib/db";
import { getThread, threadMessages } from "@/lib/messages";

export const metadata: Metadata = { title: "Gesprek", robots: { index: false } };

export default async function ThreadPage(props: PageProps<"/berichten/[id]">) {
  const { id } = await props.params;
  const v = await requireActive(`/berichten/${id}`);
  const db = await getDb();
  const t = await getThread(db, v, id);
  if (!t) notFound();
  const { messages, more } = await threadMessages(db, v, id);
  return (
    <ChatRoom
      key={id}
      threadId={id}
      otherName={t.otherName}
      otherUsername={t.otherUsername}
      initial={messages}
      more={more}
      disabled={t.blocked ? "Jullie kunnen elkaar geen berichten meer sturen." : undefined}
    />
  );
}
