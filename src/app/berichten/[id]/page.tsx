import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlockConfirm } from "@/components/BlockConfirm";
import { ChatRoom } from "@/components/ChatRoom";
import { Dialog } from "@/components/Dialog";
import { ProposeForm } from "@/components/forms/ProposeForm";
import { requireCommunity } from "@/lib/access";
import { creditSummary } from "@/lib/billing/credits";
import { getThread, threadMessages } from "@/lib/community/contacts";
import { MIN_LEAD_MINUTES } from "@/lib/config";
import { getDb } from "@/lib/db";
import { earliestMomentInput } from "@/lib/time";

export const metadata: Metadata = { title: "Gesprek", robots: { index: false } };

export default async function ThreadPage(props: PageProps<"/berichten/[id]">) {
  const { id } = await props.params;
  const v = await requireCommunity(`/berichten/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const thread = await getThread(db, v, id);
  if (!thread) notFound();
  const { messages, more } = await threadMessages(db, v, id);
  const credits = await creditSummary(db, v.user.id);

  return (
    <div className="stack-lg">
      <ChatRoom
        kind="thread"
        id={id}
        title={thread.otherAlias}
        initial={messages}
        more={more}
        otherName={thread.otherAlias}
        disabled={thread.blocked ? "In dit gesprek kun je geen berichten meer sturen." : undefined}
      />
      {!thread.blocked && (
        <div className="card flat stack">
          <h2>Even samen zitten?</h2>
          {credits.available > 0 ? (
            <>
              <p className="muted">
                Stel een videodate van twintig minuten voor. Je hebt deze periode nog {credits.available} van {credits.quota} over.
              </p>
              <ProposeForm
                otherId={thread.otherId}
                otherName={thread.otherAlias}
                source="community"
                min={earliestMomentInput(MIN_LEAD_MINUTES)}
              />
            </>
          ) : (
            <p className="notice">
              Je videodates voor deze periode zijn op. <Link href="/lidmaatschap">Bekijk je lidmaatschap</Link>
            </p>
          )}
        </div>
      )}
      <div className="row">
        <Link href={`/cafe/leden/${thread.otherId}`} className="btn ghost">
          Profiel van {thread.otherAlias}
        </Link>
        {!thread.blocked && (
          <Dialog trigger="Blokkeren" triggerClassName="btn ghost" title={`${thread.otherAlias} blokkeren?`}>
            <BlockConfirm userId={thread.otherId} name={thread.otherAlias} back="/berichten" />
          </Dialog>
        )}
      </div>
    </div>
  );
}
