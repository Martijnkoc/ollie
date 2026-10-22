import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/Empty";
import { requireActive } from "@/lib/access";
import { getDb } from "@/lib/db";
import { ago } from "@/lib/format";
import { formatEuro } from "@/lib/money";
import { OPEN, type Order, STATUS_LABEL, ordersFor } from "@/lib/orders";

export const metadata: Metadata = { title: "Opdrachten", robots: { index: false } };

/** What needs this person's attention, per role. */
function needsMe(o: Order, role: "buyer" | "seller") {
  if (role === "buyer") return ["quoted", "awaiting_payment", "delivered"].includes(o.status);
  return ["requested", "in_progress"].includes(o.status) || Boolean(o.cancel_requested_at && o.status === "in_progress");
}

export default async function OrdersPage(props: PageProps<"/opdrachten">) {
  const sp = await props.searchParams;
  const v = await requireActive("/opdrachten");
  const db = await getDb();
  const [bought, sold] = await Promise.all([ordersFor(db, v.user.id, "buyer"), ordersFor(db, v.user.id, "seller")]);
  const role = sp.rol === "verkoper" || (sp.rol !== "koper" && bought.length === 0 && sold.length > 0) ? "seller" : "buyer";
  const list = role === "buyer" ? bought : sold;
  const open = list.filter((o) => OPEN.includes(o.status));
  const closed = list.filter((o) => !OPEN.includes(o.status));
  const todo = (rows: Order[], r: "buyer" | "seller") => rows.filter((o) => needsMe(o, r)).length;

  const Row = ({ o }: { o: Order }) => (
    <li>
      <Link href={`/opdrachten/${o.id}`} className="order-row">
        <span className="t">{o.title}</span>
        <span className="amount">{o.price_cents != null ? formatEuro(o.price_cents) : "Offerte"}</span>
        <span className="small muted">
          SY-{o.ref} · {role === "buyer" ? o.seller_name : o.buyer_name} · {ago(o.updated_at)}
        </span>
        <span className="row tight" style={{ justifyContent: "flex-end" }}>
          {needsMe(o, role) && <span className="badge lime">Actie nodig</span>}
          <span className={`status s-${o.status}`}>{STATUS_LABEL[o.status]}</span>
        </span>
      </Link>
    </li>
  );

  return (
    <div className="container mid page stack-lg">
      <div>
        <p className="eyebrow">Opdrachten</p>
        <h1 style={{ margin: 0 }}>Alles wat je koopt en verkoopt</h1>
      </div>
      <nav className="tabs" aria-label="Rol">
        <Link href="/opdrachten?rol=koper" aria-current={role === "buyer" ? "page" : undefined}>
          Gekocht {todo(bought, "buyer") > 0 && <span className="count-dot">{todo(bought, "buyer")}</span>}
        </Link>
        <Link href="/opdrachten?rol=verkoper" aria-current={role === "seller" ? "page" : undefined}>
          Verkocht {todo(sold, "seller") > 0 && <span className="count-dot">{todo(sold, "seller")}</span>}
        </Link>
      </nav>
      {list.length === 0 ? (
        <Empty title={role === "buyer" ? "Je hebt nog niets besteld" : "Nog geen opdrachten binnen"}>
          <p>
            {role === "buyer"
              ? "Vind iemand voor je klus, of vraag maatwerk aan bij een maker."
              : "Zorg voor een openbaar profiel met werk en diensten, dan kunnen klanten je vinden."}
          </p>
          <Link href={role === "buyer" ? "/ontdek" : "/dashboard"} className="btn">
            {role === "buyer" ? "Ontdek talent" : "Naar je dashboard"}
          </Link>
        </Empty>
      ) : (
        <>
          <section className="stack" aria-labelledby="lopend">
            <h2 id="lopend" style={{ fontSize: "1.2rem", margin: 0 }}>
              Lopend ({open.length})
            </h2>
            {open.length === 0 ? (
              <p className="muted">Niets lopends.</p>
            ) : (
              <ul className="list">
                {open.map((o) => (
                  <Row key={o.id} o={o} />
                ))}
              </ul>
            )}
          </section>
          {closed.length > 0 && (
            <section className="stack" aria-labelledby="afgesloten">
              <h2 id="afgesloten" style={{ fontSize: "1.2rem", margin: 0 }}>
                Afgesloten ({closed.length})
              </h2>
              <ul className="list">
                {closed.map((o) => (
                  <Row key={o.id} o={o} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
