import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatRoom } from "@/components/ChatRoom";
import { requireCommunity } from "@/lib/access";
import { channelMessages, getChannel } from "@/lib/community/channels";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Cafe", robots: { index: false } };

export default async function ChannelPage(props: PageProps<"/cafe/[slug]">) {
  const { slug } = await props.params;
  const v = await requireCommunity(`/cafe/${slug}`);
  const db = await getDb();
  const channel = await getChannel(db, slug);
  if (!channel) notFound();
  const { messages, more } = await channelMessages(db, v, channel.id);
  return (
    <ChatRoom kind="channel" id={channel.slug} title={channel.name} description={channel.description} initial={messages} more={more} />
  );
}
