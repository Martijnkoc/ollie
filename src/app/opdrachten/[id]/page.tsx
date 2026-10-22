import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatRoom } from "@/components/ChatRoom";
import { Dialog } from "@/components/Dialog";
import {
  AcceptQuoteForm,
  ChangesForm,
  ComplaintForm,
  CompleteForm,
  DeclineQuoteForm,
  DeliverForm,
  PayForm,
  QuoteForm,
  RefundForm,
  RequestCancelForm,
  ReviewForm,
  StepOutForm,
} from "@/components/forms/OrderForms";
import { ReportForm } from "@/components/forms/SafetyForms";
import { requireActive } from "@/lib/access";
import { AUTO_COMPLETE_DAYS, PLATFORM_FEE_BPS } from "@/lib/config";
import { getDb } from "@/lib/db";
import { days, formatDate, formatDateTime } from "@/lib/format";
import { getThread, threadBetween, threadMessages } from "@/lib/messages";
import { feePercentLabel, formatEuro } from "@/lib/money";
import { STATUS_LABEL, eventsFor, getOrder, mayCancelWithRefund, quotesFor } from "@/lib/orders";
import { canReceive, payoutAccount } from "@/lib/payments";
import { stripeMode } from "@/lib/payments-client";
import { reviewForOrder } from "@/lib/reviews";

export const metadata: Metadata = { title: "Opdracht", robots: { index: false } };

const EVENT: Record<string, string> = {
  ordered: "Besteld",
  requested: "Aanvraag verstuurd",
  quoted: "Offerte verstuurd",
  quote_declined: "Offerte afgewezen",
  quote_expired: "Offerte verlopen",
  quote_accepted: "Offerte geaccepteerd",
  paid: "Betaling ontvangen",
  payment_failed: "Betaling mislukt",
  checkout_expired: "Betaalpagina verlopen",
  delivered: "Opgeleverd",
  changes_requested: "Aanpassingen gevraagd",
  completed: "Goedgekeurd en afgerond",
  auto_completed: `Automatisch afgerond na ${AUTO_COMPLETE_DAYS} dagen`,
  paid_out: "Uitbetaald aan de maker",
  cancel_requested: "Verzoek om te annuleren",
  refunded: "Geannuleerd, bedrag wordt terugbetaald",
  declined: "Afgewezen door de maker",
  withdrawn: "Ingetrokken door de koper",
  disputed: "Klacht ingediend",
  dispute_released: "Klacht afgehandeld: uitbetaald aan de maker",
  dispute_resumed: "Klacht afgehandeld: opdracht loopt verder",
  chargeback: "Betwisting via de bank",
  cancelled_block: "Gestopt door een blokkade",
  cancelled_moderation: "Gestopt door moderatie",
  payment_mismatch: "Betaling klopte niet met het afgesproken bedrag",
  duplicate_payment: "Dubbele betaling, wordt terugbetaald",
  paid_after_cancel: "Betaling na annuleren, wordt terugbetaald",
};

const STEPS = [
  { key: "agree", label: "Afspraak" },
  { key: "pay", label: "Betaling" },
  { key: "work", label: "Uitvoering" },
  { key: "delivered", label: "Oplevering" },
  { key: "done", label: "Afgerond" },
];

function stepIndex(status: string) {
  return { requested: 0, quoted: 0, awaiting_payment: 1, in_progress: 2, delivered: 3, completed: 4, disputed: 2 }[status] ?? -1;
}

export default async function OrderDetail(props: PageProps<"/opdrachten/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const v = await requireActive(`/opdrachten/${id}`);
  const db = await getDb();
  const o = await getOrder(db, v, id);
  if (!o) notFound();
  const role = o.buyer_id === v.user.id ? "buyer" : o.seller_id === v.user.id ? "seller" : "staff";
  const other = role === "buyer" ? { id: o.seller_id, name: o.seller_name } : { id: o.buyer_id, name: o.buyer_name };
  const [quotes, events, review] = await Promise.all([quotesFor(db, o.id), eventsFor(db, o.id), reviewForOrder(db, o.id)]);
  const openQuote = quotes.find((q) => q.status === "open");

  let chat:
    | { id: string; data: Awaited<ReturnType<typeof threadMessages>>; thread: NonNullable<Awaited<ReturnType<typeof getThread>>> }
    | undefined;
  if (role !== "staff" && other.id) {
    const threadId = await threadBetween(db, v.user.id, other.id);
    const thread = threadId ? await getThread(db, v, threadId) : undefined;
    if (threadId && thread) chat = { id: threadId, thread, data: await threadMessages(db, v, threadId) };
  }

  let payDisabled: string | null = null;
  if (o.status === "awaiting_payment" && role === "buyer") {
    if (stripeMode() === "none") payDisabled = "Online betalen is in deze omgeving nog niet geconfigureerd. Er wordt niets afgeschreven.";
    else if (!canReceive(await payoutAccount(db, o.seller_id!)))
      payDisabled = `${o.seller_name} heeft uitbetalingen nog niet ingesteld. Stuur een bericht; je kunt betalen zodra dat geregeld is.`;
  }
  const now = new Date();
  const step = stepIndex(o.status);
  const stopped = ["declined", "withdrawn", "cancelled"].includes(o.status);

  return (
    <div className="container page stack-lg">
      <div className="stack">
        <Link href="/opdrachten" className="small">
          ← Alle opdrachten
        </Link>
        <div className="row between top">
          <div className="stack-sm">
            <p className="eyebrow" style={{ margin: 0 }}>
              SY-{o.ref} · {o.kind === "fixed" ? "Vaste prijs" : "Maatwerk"} ·{" "}
              {role === "buyer"
                ? `bij ${o.seller_name}`
                : role === "seller"
                  ? `voor ${o.buyer_name}`
                  : `${o.buyer_name} → ${o.seller_name}`}
            </p>
            <h1 style={{ margin: 0 }}>{o.title}</h1>
          </div>
          <span className={`status s-${o.status}`} style={{ fontSize: "1rem" }}>
            {STATUS_LABEL[o.status]}
          </span>
        </div>
        {!stopped && (
          <ol className="progress" aria-label="Voortgang">
            {STEPS.map((s, i) => (
              <li key={s.key} className={i < step ? "done" : i === step ? "now" : ""} aria-current={i === step ? "step" : undefined}>
                <span>{s.label}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {sp.nieuw && (
        <p className="notice good" role="status">
          {o.kind === "fixed"
            ? "Je bestelling is geplaatst. Rond hieronder de betaling af."
            : "Je aanvraag is verstuurd. Je krijgt een e-mail zodra er een offerte is."}
        </p>
      )}
      {sp.betaling === "verwerken" && o.payment_status === "none" && (
        <p className="notice" role="status">
          We wachten op de bevestiging van Stripe. Dat duurt meestal een paar seconden; ververs deze pagina zo. Er wordt niets dubbel
          afgeschreven.
        </p>
      )}
      {sp.betaling === "afgebroken" && o.payment_status === "none" && (
        <p className="notice warn">De betaling is afgebroken. Er is niets afgeschreven.</p>
      )}

      <div className="split wide-side">
        <div className="stack-lg">
          <ActionPanel />

          <section className="stack" aria-labelledby="details">
            <h2 id="details" style={{ fontSize: "1.4rem", margin: 0 }}>
              {o.kind === "custom" ? "De aanvraag" : "De bestelling"}
            </h2>
            {o.brief ? <p className="pre">{o.brief}</p> : <p className="muted">Geen toelichting meegegeven.</p>}
            <dl className="kv" style={{ maxWidth: 520 }}>
              {o.budget_cents != null && (
                <>
                  <dt>Budget van de koper</dt>
                  <dd>{formatEuro(o.budget_cents)}</dd>
                </>
              )}
              {o.desired_by && (
                <>
                  <dt>Gewenst klaar op</dt>
                  <dd>{formatDate(o.desired_by)}</dd>
                </>
              )}
              {o.location && (
                <>
                  <dt>Locatie</dt>
                  <dd>{o.location}</dd>
                </>
              )}
              {o.extras.map((e) => (
                <div key={e.title}>
                  <dt>Uitbreiding</dt>
                  <dd>
                    {e.title} (+{formatEuro(e.price_cents)})
                  </dd>
                </div>
              ))}
            </dl>
            {o.delivery_note && (
              <div className="card stack-sm">
                <p className="eyebrow" style={{ margin: 0 }}>
                  Opleverbericht
                </p>
                <p className="pre" style={{ margin: 0 }}>
                  {o.delivery_note}
                </p>
              </div>
            )}
            {o.dispute_reason && (
              <div className="notice error">
                <strong>Klacht:</strong> {o.dispute_reason}
              </div>
            )}
          </section>

          {quotes.length > 0 && (
            <section className="stack" aria-labelledby="offertes">
              <h2 id="offertes" style={{ fontSize: "1.4rem", margin: 0 }}>
                Offertes
              </h2>
              <ul className="list">
                {quotes.map((q) => (
                  <li key={q.id} className={q.status === "open" ? "quote stack" : "card tight stack-sm"}>
                    <div className="row between">
                      <strong style={{ fontFamily: "var(--display)", fontSize: q.status === "open" ? "1.8rem" : "1.1rem" }}>
                        {formatEuro(q.price_cents)}
                      </strong>
                      <span className="badge">
                        {
                          {
                            open: "Staat open",
                            accepted: "Geaccepteerd",
                            declined: "Afgewezen",
                            withdrawn: "Ingetrokken",
                            superseded: "Vervangen",
                            expired: "Verlopen",
                          }[q.status]
                        }
                      </span>
                    </div>
                    <p className="small muted" style={{ margin: 0 }}>
                      Levering in {days(q.delivery_days)} na betaling · geldig tot {formatDate(q.valid_until)}
                    </p>
                    {q.message && (
                      <p className="pre" style={{ margin: 0 }}>
                        {q.message}
                      </p>
                    )}
                    {q.status === "open" && role === "buyer" && o.status === "quoted" && (
                      <div className="stack">
                        <p className="tiny faint" style={{ margin: 0 }}>
                          Je betaalt {formatEuro(q.price_cents)}, zonder extra servicekosten. Daarvan gaat {feePercentLabel()} naar Sell
                          Yourself.
                        </p>
                        <AcceptQuoteForm orderId={o.id} quoteId={q.id} price={q.price_cents} />
                        <DeclineQuoteForm orderId={o.id} quoteId={q.id} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {chat && (
            <ChatRoom
              embedded
              threadId={chat.id}
              otherName={chat.thread.otherName}
              otherUsername={chat.thread.otherUsername}
              initial={chat.data.messages}
              more={chat.data.more}
              orderId={o.id}
              orderRef={o.ref}
              disabled={
                chat.thread.blocked
                  ? "Jullie kunnen elkaar geen berichten meer sturen. De opdracht zelf kun je hier nog afronden."
                  : undefined
              }
            />
          )}
        </div>

        <aside className="sticky-side stack">
          <div className="card stack">
            <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Overzicht</h2>
            {o.price_cents != null ? (
              <dl className="kv">
                <dt>Afgesproken prijs</dt>
                <dd>{formatEuro(o.price_cents)}</dd>
                {role !== "buyer" && (
                  <>
                    <dt>Platformkosten ({((o.fee_bps ?? PLATFORM_FEE_BPS) / 100).toLocaleString("nl-NL")}%)</dt>
                    <dd>− {formatEuro(o.fee_cents)}</dd>
                    <dt className="total">Maker ontvangt</dt>
                    <dd className="total">{formatEuro(o.seller_amount_cents)}</dd>
                  </>
                )}
                {role === "buyer" && (
                  <>
                    <dt>Servicekosten</dt>
                    <dd>€ 0</dd>
                    <dt className="total">Totaal</dt>
                    <dd className="total">{formatEuro(o.price_cents)}</dd>
                  </>
                )}
                <dt>Levertijd</dt>
                <dd>{days(o.delivery_days)}</dd>
                {o.due_at && (
                  <>
                    <dt>Uiterlijk klaar</dt>
                    <dd>{formatDate(o.due_at)}</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                Nog geen prijs: die volgt uit de offerte.
              </p>
            )}
            <dl className="kv">
              <dt>Betaling</dt>
              <dd>
                {
                  { none: "Nog niet betaald", paid: "Betaald", refund_pending: "Terugbetaling loopt", refunded: "Terugbetaald" }[
                    o.payment_status
                  ]
                }
              </dd>
              {role !== "buyer" && o.payment_status === "paid" && (
                <>
                  <dt>Uitbetaling</dt>
                  <dd>
                    {
                      { none: "Na goedkeuring", pending: "Wordt klaargezet", sent: "Verstuurd", failed: "Mislukt, we proberen opnieuw" }[
                        o.transfer_status
                      ]
                    }
                  </dd>
                </>
              )}
            </dl>
          </div>
          {o.terms_accepted_at && <p className="tiny faint">Afspraak bevestigd door de koper op {formatDateTime(o.terms_accepted_at)}.</p>}
          <section className="stack-sm" aria-labelledby="tijdlijn">
            <h2 id="tijdlijn" style={{ fontSize: "1.1rem" }}>
              Tijdlijn
            </h2>
            <ol className="timeline">
              {events.map((e) => (
                <li key={e.id}>
                  <time dateTime={new Date(e.created_at).toISOString()}>{formatDateTime(e.created_at)}</time>
                  {EVENT[e.kind] ?? e.kind}
                  {e.actor_name && <span className="faint"> · {e.actor_id === v.user.id ? "jij" : e.actor_name}</span>}
                  {e.note && !["delivered", "payment_mismatch", "duplicate_payment"].includes(e.kind) && (
                    <span className="faint small pre"> — {e.note}</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
          {role !== "staff" && other.id && (
            <Dialog trigger="Probleem melden" triggerClassName="btn ghost small" title="Opdracht melden aan een moderator">
              <ReportForm context="order" contextId={o.id} name={other.name} allowBlock={false} />
            </Dialog>
          )}
        </aside>
      </div>
    </div>
  );

  function ActionPanel() {
    const panel = (title: string, children: React.ReactNode) => (
      <section className="card raised stack" aria-labelledby="actie">
        <h2 id="actie" aria-live="polite" style={{ fontSize: "1.25rem", margin: 0 }}>
          {title}
        </h2>
        {children}
      </section>
    );
    const s = o!.status;
    if (role === "staff") return panel("Je bekijkt dit als moderator", <Link href={`/beheer/klachten`}>Naar klachten</Link>);
    if (role === "buyer") {
      if (s === "requested")
        return panel(
          "Wachten op een offerte",
          <>
            <p className="muted" style={{ margin: 0 }}>
              {o!.seller_name} bekijkt je aanvraag. Stel gerust vragen in de chat.
            </p>
            <details>
              <summary className="small">Aanvraag intrekken</summary>
              <StepOutForm orderId={o!.id} role="buyer" />
            </details>
          </>,
        );
      if (s === "quoted")
        return panel(
          "Je hebt een offerte",
          <>
            <p className="muted" style={{ margin: 0 }}>
              Bekijk de offerte hieronder. Accepteren is de afspraak; daarna betaal je.
            </p>
            <details>
              <summary className="small">Aanvraag intrekken</summary>
              <StepOutForm orderId={o!.id} role="buyer" />
            </details>
          </>,
        );
      if (s === "awaiting_payment")
        return panel(
          "Rond de betaling af",
          <>
            <PayForm orderId={o!.id} price={o!.price_cents!} disabledReason={payDisabled} />
            <details>
              <summary className="small">Toch niet? Intrekken</summary>
              <StepOutForm orderId={o!.id} role="buyer" />
            </details>
          </>,
        );
      if (s === "in_progress")
        return panel(
          "De maker is aan de slag",
          <>
            <p className="muted" style={{ margin: 0 }}>
              Uiterlijk klaar op {o!.due_at ? formatDate(o!.due_at) : "–"}. Je krijgt een e-mail bij de oplevering.
            </p>
            {o!.cancel_requested_at && (
              <p className="notice small">
                Je hebt gevraagd om te annuleren. {o!.seller_name} kan akkoord gaan; je krijgt dan alles terug.
              </p>
            )}
            {mayCancelWithRefund(o!, v.user.id, now) && (
              <details>
                <summary className="small">De levertijd is verstreken: annuleren en geld terug</summary>
                <RefundForm orderId={o!.id} label="Annuleren en geld terug" />
              </details>
            )}
            {!o!.cancel_requested_at && (
              <details>
                <summary className="small">Vragen om te annuleren</summary>
                <RequestCancelForm orderId={o!.id} />
              </details>
            )}
            <details>
              <summary className="small">Klacht indienen</summary>
              <ComplaintForm orderId={o!.id} />
            </details>
          </>,
        );
      if (s === "delivered")
        return panel(
          "Bekijk de oplevering",
          <>
            <p className="muted" style={{ margin: 0 }}>
              Tevreden? Keur goed, dan krijgt {o!.seller_name} het geld. Zonder reactie keuren we de oplevering na {AUTO_COMPLETE_DAYS}{" "}
              dagen automatisch goed.
            </p>
            <CompleteForm orderId={o!.id} />
            <details>
              <summary className="small">Om aanpassingen vragen</summary>
              <ChangesForm orderId={o!.id} />
            </details>
            <details>
              <summary className="small">Klacht indienen</summary>
              <ComplaintForm orderId={o!.id} />
            </details>
          </>,
        );
      if (s === "completed")
        return panel(
          "Afgerond",
          review ? (
            <p className="muted" style={{ margin: 0 }}>
              Bedankt voor je review.
            </p>
          ) : (
            <>
              <p className="muted" style={{ margin: 0 }}>
                Hoe was het? Je review helpt anderen.
              </p>
              <ReviewForm orderId={o!.id} />
            </>
          ),
        );
      if (s === "disputed")
        return panel(
          "Klacht in behandeling",
          <p className="muted" style={{ margin: 0 }}>
            Een moderator bekijkt de opdracht. Je hoort de uitkomst per e-mail.
          </p>,
        );
    }
    if (role === "seller") {
      if (s === "requested" || s === "quoted")
        return panel(
          s === "requested" ? "Stuur een offerte" : "Je offerte staat open",
          <>
            {s === "quoted" && (
              <p className="muted" style={{ margin: 0 }}>
                Wacht op {o!.buyer_name}, of stuur een nieuwe offerte die de vorige vervangt.
              </p>
            )}
            {s === "requested" ? (
              <QuoteForm orderId={o!.id} feePercent={PLATFORM_FEE_BPS / 100} />
            ) : (
              <details>
                <summary className="small">Nieuwe offerte sturen</summary>
                <QuoteForm orderId={o!.id} feePercent={PLATFORM_FEE_BPS / 100} />
              </details>
            )}
            <details>
              <summary className="small">Opdracht afwijzen</summary>
              <StepOutForm orderId={o!.id} role="seller" />
            </details>
          </>,
        );
      if (s === "awaiting_payment")
        return panel(
          "Wacht op betaling",
          <>
            <p className="muted" style={{ margin: 0 }}>
              Begin pas als de betaling binnen is; je krijgt een e-mail.
            </p>
            <details>
              <summary className="small">Opdracht afwijzen</summary>
              <StepOutForm orderId={o!.id} role="seller" />
            </details>
          </>,
        );
      if (s === "in_progress")
        return panel(
          "Aan de slag",
          <>
            <p className="muted" style={{ margin: 0 }}>
              Lever uiterlijk {o!.due_at ? formatDate(o!.due_at) : "op tijd"} op.
            </p>
            {o!.cancel_requested_at && (
              <p className="notice warn small">
                {o!.buyer_name} vraagt om te annuleren: {o!.cancel_reason}
              </p>
            )}
            <DeliverForm orderId={o!.id} />
            <details open={Boolean(o!.cancel_requested_at)}>
              <summary className="small">
                {o!.cancel_requested_at ? "Akkoord: annuleren en terugbetalen" : "Annuleren en terugbetalen"}
              </summary>
              <RefundForm orderId={o!.id} label="Annuleren en volledig terugbetalen" />
            </details>
            <details>
              <summary className="small">Klacht indienen</summary>
              <ComplaintForm orderId={o!.id} />
            </details>
          </>,
        );
      if (s === "delivered")
        return panel(
          "Opgeleverd",
          <>
            <p className="muted" style={{ margin: 0 }}>
              Wacht op goedkeuring van {o!.buyer_name}. Zonder reactie keuren we na {AUTO_COMPLETE_DAYS} dagen automatisch goed.
            </p>
            <details>
              <summary className="small">Klacht indienen</summary>
              <ComplaintForm orderId={o!.id} />
            </details>
          </>,
        );
      if (s === "completed")
        return panel(
          "Afgerond",
          <p className="muted" style={{ margin: 0 }}>
            {o!.payment_status === "paid" ? "De uitbetaling gaat naar je Stripe-account." : "Klaar."}{" "}
            {review ? "Je hebt een review gekregen; je kunt erop reageren op je profiel." : ""}
          </p>,
        );
      if (s === "disputed")
        return panel(
          "Klacht in behandeling",
          <p className="muted" style={{ margin: 0 }}>
            Een moderator bekijkt de opdracht. Je hoort de uitkomst per e-mail.
          </p>,
        );
    }
    return panel(
      STATUS_LABEL[s],
      <p className="muted" style={{ margin: 0 }}>
        {o!.cancel_reason ?? "Deze opdracht loopt niet meer."}
      </p>,
    );
  }
}
