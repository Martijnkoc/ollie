"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  olderChannelMessages,
  olderThreadMessages,
  removeChannelMessage,
  sendChannelMessage,
  sendThreadMessage,
} from "@/app/actions/community";
import { Dialog } from "./Dialog";
import { ReportForm } from "./forms/ReportForm";

export type Msg = { id: number; author_id: string; alias?: string; body: string; created_at: string | Date; mine: boolean };

const time = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "short" });

function stamp(d: string | Date) {
  const date = new Date(d);
  const today = new Date().toDateString() === date.toDateString();
  return today ? time.format(date) : `${day.format(date)} ${time.format(date)}`;
}

export function ChatRoom({
  kind,
  id,
  title,
  description,
  initial,
  more,
  otherName,
  disabled,
}: {
  kind: "channel" | "thread";
  id: string;
  title: string;
  description?: string;
  initial: Msg[];
  more: boolean;
  otherName?: string;
  disabled?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [hasMore, setHasMore] = useState(more);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<"live" | "reconnecting" | "closed">("live");
  const [sending, setSending] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const lastId = useRef(initial.at(-1)?.id ?? 0);
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
    const url = `/api/stream/${kind === "channel" ? "kanaal" : "gesprek"}/${id}?after=${lastId.current}`;
    const source = new EventSource(url);
    source.addEventListener("message", (e) => {
      setStatus("live");
      add([JSON.parse((e as MessageEvent).data)]);
    });
    source.onopen = () => setStatus("live");
    source.onerror = () => setStatus(source.readyState === EventSource.CLOSED ? "closed" : "reconnecting");
    return () => source.close();
  }, [kind, id, add]);

  useEffect(() => {
    const el = log.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(undefined);
    const res = kind === "channel" ? await sendChannelMessage(id, body) : await sendThreadMessage(id, body);
    setSending(false);
    if (!res.ok) return setError(res.error);
    setDraft("");
    stick.current = true;
    add(res.data.map((m) => ({ ...m, mine: true })));
  }

  async function loadOlder() {
    const first = messages[0]?.id;
    if (!first) return;
    const res = kind === "channel" ? await olderChannelMessages(id, first) : await olderThreadMessages(id, first);
    if (!res.ok) return setError(res.error);
    stick.current = false;
    setMessages((prev) => [...res.data.messages, ...prev]);
    setHasMore(res.data.more);
  }

  async function remove(messageId: number) {
    const res = await removeChannelMessage(messageId);
    if (!res.ok) return setError(res.error);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }

  return (
    <section className="chat" aria-labelledby="chat-title">
      <div className="chat-head row between">
        <div>
          <h1 id="chat-title">{title}</h1>
          {description && (
            <p className="muted small" style={{ margin: 0 }}>
              {description}
            </p>
          )}
        </div>
        <span className={`badge ${status === "live" ? "good" : ""}`} role="status">
          {status === "live" ? "Live" : status === "reconnecting" ? "Opnieuw verbinden…" : "Verbinding verbroken"}
        </span>
      </div>
      <div
        className="chat-log"
        ref={log}
        role="log"
        aria-live="polite"
        aria-label={`Berichten in ${title}`}
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
            {kind === "channel" ? "Nog geen berichten. Zeg jij als eerste hoi?" : `Nog geen berichten. Begin het gesprek met ${otherName}.`}
          </p>
        )}
        {messages.map((m) => (
          <article
            key={m.id}
            className={`msg${m.mine ? " mine" : ""}`}
            aria-label={`${m.mine ? "Jij" : (m.alias ?? otherName)} om ${stamp(m.created_at)}`}
          >
            <div className="meta">
              {m.mine ? (
                <strong>Jij</strong>
              ) : kind === "channel" ? (
                <Link href={`/cafe/leden/${m.author_id}`}>{m.alias}</Link>
              ) : (
                <strong>{otherName}</strong>
              )}
              <time dateTime={new Date(m.created_at).toISOString()}>{stamp(m.created_at)}</time>
              <span className="msg-actions">
                {m.mine && kind === "channel" && (
                  <button type="button" onClick={() => remove(m.id)}>
                    Verwijderen
                  </button>
                )}
                {!m.mine && (
                  <Dialog trigger="Melden" triggerClassName="" title="Bericht melden">
                    <ReportForm
                      context={kind === "channel" ? "message" : "thread_message"}
                      contextId={String(m.id)}
                      name={m.alias ?? otherName}
                    />
                  </Dialog>
                )}
              </span>
            </div>
            <div className="bubble">{m.body}</div>
          </article>
        ))}
      </div>
      {disabled ? (
        <p className="notice" style={{ margin: 16 }}>
          {disabled}
        </p>
      ) : (
        <form className="composer" onSubmit={send}>
          <label htmlFor="composer" className="visually-hidden">
            Bericht
          </label>
          <textarea
            id="composer"
            value={draft}
            maxLength={kind === "channel" ? 1000 : 2000}
            placeholder={kind === "channel" ? "Schrijf iets aan tafel…" : `Bericht aan ${otherName}…`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            aria-describedby="composer-hint"
          />
          <button type="submit" className="btn" disabled={sending || !draft.trim()}>
            Verstuur
          </button>
        </form>
      )}
      <p id="composer-hint" className="visually-hidden">
        Enter verstuurt, Shift en Enter maakt een nieuwe regel.
      </p>
      {error && (
        <p className="notice error" role="alert" style={{ margin: 16 }}>
          {error}
        </p>
      )}
    </section>
  );
}
