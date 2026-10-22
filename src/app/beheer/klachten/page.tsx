import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/Empty";
import { ResolveDispute } from "@/components/forms/ModerationForms";
import { requireStaff } from "@/lib/access";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { formatEuro } from "@/lib/money";
import { stripeMode } from "@/lib/payments-client";

export const metadata: Metadata = { title: "Klachten", robots: { index: false } };

export default async function DisputesPage() {
  await requireStaff();
  const rows = await (
    await getDb()
  ).query<{
    id: string;
    ref: number;
    title: string;
    price_cents: number | null;
    payment_status: string;
    dispute_reason: string;
    disputed_at: Date;
    buyer_id: string | null;
    seller_id: string | null;
    buyer: string | null;
    seller: string | null;
  }>(
    `select o.id, o.ref::int as ref, o.title, o.price_cents, o.payment_status, o.dispute_reason, o.disputed_at, o.buyer_id, o.seller_id,
       bp.display_name as buyer, sp.display_name as seller
     from orders o left join profiles bp on bp.user_id = o.buyer_id left join profiles sp on sp.user_id = o.seller_id
     where o.status = 'disputed' order by o.disputed_at`,
  );
  return (
    <>
      <div>
        <h1>Klachten</h1>
        <p className="muted">
          Bekijk de opdracht, de tijdlijn en de berichten bij de opdracht voordat je besluit. Beide partijen zien je toelichting.
          {stripeMode() === "none" &&
            " Let op: online betalen is niet geconfigureerd, dus terugbetalen en uitbetalen via Stripe kan hier nu niet."}
        </p>
      </div>
      {rows.length === 0 ? (
        <Empty title="Geen open klachten" />
      ) : (
        <ul className="list">
          {rows.map((o) => (
            <li key={o.id} className="card stack">
              <div className="row between">
                <Link href={`/opdrachten/${o.id}`} style={{ fontWeight: 700 }}>
                  SY-{o.ref} · {o.title}
                </Link>
                <span>{o.price_cents != null ? formatEuro(o.price_cents) : "–"}</span>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                Koper: {o.buyer_id ? <Link href={`/beheer/gebruikers/${o.buyer_id}`}>{o.buyer ?? "–"}</Link> : "verwijderd"} · Maker:{" "}
                {o.seller_id ? <Link href={`/beheer/gebruikers/${o.seller_id}`}>{o.seller ?? "–"}</Link> : "verwijderd"} · sinds{" "}
                {formatDateTime(o.disputed_at)} · {o.payment_status === "paid" ? "betaald" : o.payment_status}
              </p>
              <blockquote className="card tight pre" style={{ margin: 0 }}>
                {o.dispute_reason}
              </blockquote>
              <ResolveDispute orderId={o.id} paid={o.payment_status === "paid"} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
