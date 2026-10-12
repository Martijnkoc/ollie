import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DateRoom } from "@/components/DateRoom";
import { viewer } from "@/lib/access";
import { settleAndClose, viewFor } from "@/lib/dates/core";
import { getDb } from "@/lib/db";
import { videoProvider } from "@/lib/video/provider";

export const metadata: Metadata = { title: "Videodate", robots: { index: false } };

export default async function RoomPage(props: PageProps<"/afspraken/[id]/kamer">) {
  const { id } = await props.params;
  const v = await viewer();
  if (!v) redirect(`/inloggen?next=/afspraken/${id}/kamer`);
  if (v.restricted) redirect("/beperkt");
  const db = await getDb();
  const provider = videoProvider();
  await settleAndClose(db, id, provider).catch(() => {});
  const view = await viewFor(db, v.user.id, id);
  if (!view) notFound();
  if (view.phase !== "lobby" && view.phase !== "live") redirect(`/afspraken/${id}`);
  return <DateRoom dateId={id} myName={view.me.display_name} otherName={view.other.display_name} testMode={provider?.name === "fake"} />;
}
