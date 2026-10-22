"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { markReadAction, olderMessages, sendMessage } from "@/app/actions/messages";
import { Dialog } from "./Dialog";
import { ReportForm } from "./forms/SafetyForms";

export type Msg = { id: number; author_id: string; body: string; created_at: string | Date; mine: boolean; order_ref: number | null };

const time = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "short" });

function stamp(d: string | Date) {
  const date = new Date(d);
  const today = new Date().toDateString() === date.toDateString();
  return today ? time.format(date) : `${day.format(date)} ${time.format(date)}`;
}

/** Live conversation over Server-Sent Events; the server checks access on every (re)connection. */
export function ChatRoom({
  threadId,
  otherName,
  otherUsername,
  initial,
  more,
  disabled,
  orderId,
  orderRef,
  embedded,
}: {
  threadId: string;
  otherName: string;
  otherUsername: string | null;
  initial: Msg[];
  more: boolean;
  disabled?: string;
  orderId?: string;
  orderRef?: number;
  embedded?: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [hasMore, setHasMore] = useState(more);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<"live" | "reconnecting" | "closed">("live");
  const [sending, setSending] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const lastId = useRef(initial.at(-1)?.id ?? 0);
  const readId = useRef(0);
  const stick = useRef(true);

  const add = useCallback((incoming: Msg[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const merged = [...prev, ...incoming.filter((m) => !seen.has(m.id))].sort((a, b) => a.id - b.id);
      lastId.current = Math.max(lastId.current, ...merged.map((m) => m.id));
      return merged;
    });
  }, []);

  useEffect(() => {
    const source = new EventSource(`/api/stream/gesprek/${threadId}?after=${lastId.current}`);
    source.addEventListener("message", (e) => {
      setStatus("live");
      add([JSON.parse((e as MessageEvent).data)]);
    });
    source.onopen = () => setStatus("live");
    source.onerror = () => setStatus(source.readyState === EventSource.CLOSED ? "closed" : "reconnecting");
    return () => source.close();
  }, [threadId, add]);

  useEffect(() => {
    const el = log.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
    const last = messages.at(-1)?.id ?? 0;
    if (last > readId.current && document.visibilityState === "visible") {
      readId.current = last;
      void markReadAction(threadId, last);
    }
  }, [messages, threadId]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(undefined);
    const res = await sendMessage(threadId, body, orderId);
    setSending(false);
    if (!res.ok) return setError(res.error);
    setDraft("");
    stick.current = true;
    add(res.data.map((m) => ({ ...m, mine: true })));
  }

  async function loadOlder() {
    const first = messages[0]?.id;
    if (!first) return;
    const res = await olderMessages(threadId, first);
    if (!res.ok) return setError(res.error);
    stick.current = false;
    setMessages((prev) => [...res.data.messages, ...prev]);
    setHasMore(res.data.more);
  }

  const titleId = `chat-${threadId}`;
  return (
    <section className={`chat${embedded ? " embedded" : ""}`} aria-labelledby={titleId}>
      <div className="chat-head row between">
        {!embedded && (
          <Link href="/berichten" className="small hide-desktop">
            ← Gesprekken
          </Link>
        )}
        <h2 id={titleId}>
          {embedded ? "Berichten met " : ""}
          {otherUsername ? <Link href={`/@${otherUsername}`}>{otherName}</Link> : otherName}
        </h2>
        <span className={`badge ${status === "live" ? "lime" : ""}`} role="status">
          {status === "live" ? "Live" : status === "reconnecting" ? "Opnieuw verbinden…" : "Verbinding verbroken"}
        </span>
      </div>
      <div
        className="chat-log"
        ref={log}
        role="log"
        aria-live="polite"
        aria-label={`Berichten met ${otherName}`}
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {hasMore && (
          <button type="button" className="btn ghost small" style={{ alignSelf: "center" }} onClick={loadOlder}>
            Oudere berichten laden
          </button>
        )}
        {messages.length === 0 && (
          <p className="muted" style={{ textAlign: "center", margin: "auto" }}>
            Nog geen berichten. Stel je vraag aan {otherName}.
          </p>
        )}
        {messages.map((m) => (
          <article
            key={m.id}
            className={`msg${m.mine ? " mine" : ""}`}
            aria-label={`${m.mine ? "Jij" : otherName} om ${stamp(m.created_at)}`}
          >
            <div className="bubble">{m.body}</div>
            <div className="meta">
              <time dateTime={new Date(m.created_at).toISOString()}>{stamp(m.created_at)}</time>
              {m.order_ref && <span>· over SY-{m.order_ref}</span>}
              {!m.mine && (
                <Dialog trigger="Melden" triggerClassName="" title="Bericht melden">
                  <ReportForm context="message" contextId={String(m.id)} name={otherName} />
                </Dialog>
              )}
            </div>
          </article>
        ))}
      </div>
      {disabled ? (
        <p className="notice" style={{ margin: 12 }}>
          {disabled}
        </p>
      ) : (
        <form className="composer" onSubmit={send}>
          <label htmlFor={`composer-${threadId}`} className="visually-hidden">
            Bericht aan {otherName}
          </label>
          <textarea
            id={`composer-${threadId}`}
            value={draft}
            maxLength={4000}
            placeholder={orderRef ? `Bericht over SY-${orderRef}…` : `Bericht aan ${otherName}…`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            aria-describedby={`hint-${threadId}`}
          />
          <button type="submit" className="btn" disabled={sending || !draft.trim()}>
            Verstuur
          </button>
        </form>
      )}
      <p id={`hint-${threadId}`} className="visually-hidden">
        Enter verstuurt, Shift en Enter maakt een nieuwe regel.
      </p>
      {error && (
        <p className="notice error" role="alert" style={{ margin: 12 }}>
          {error}
        </p>
      )}
    </section>
  );
}
