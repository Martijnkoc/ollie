import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Room } from "@/components/Room";
import { getView, markJoined } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { endsAt } from "@/lib/time";
import { paths } from "@/lib/url";
import { joinInfo } from "@/lib/video";

export const metadata: Metadata = { title: "Videodate", robots: { index: false } };

export default async function RoomPage(props: PageProps<"/d/[token]/kamer">) {
  const { token } = await props.params;
  const db = await getDb();
  const view = await getView(db, token);
  if (!view) notFound();
  if (view.me.blocked_at || (view.phase !== "lobby" && view.phase !== "live")) redirect(paths.date(token));

  await markJoined(db, token);
  const join = await joinInfo(db, view.date, view.me.first_name);

  return (
    <Room
      join={join}
      otherName={view.other.first_name}
      myName={view.me.first_name}
      startsAt={view.date.starts_at.toISOString()}
      endsAt={endsAt(view.date.starts_at, view.date.duration_minutes).toISOString()}
      leaveHref={paths.date(token)}
      doneHref={`${paths.date(token)}?keuze=1`}
    />
  );
}
