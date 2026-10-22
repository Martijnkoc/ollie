import type { Metadata } from "next";
import Link from "next/link";
import { Arrow } from "@/components/Icons";
import { requireActive } from "@/lib/access";
import { getDb, one } from "@/lib/db";
import { ago } from "@/lib/format";
import { unreadCount } from "@/lib/messages";
import { formatEuro } from "@/lib/money";
import { STATUS_LABEL, ordersFor } from "@/lib/orders";
import { canReceive, payoutAccount } from "@/lib/payments";
import { profileCompleteness, profileStats } from "@/lib/profiles";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default async function Dashboard() {
  const v = await requireActive("/dashboard");
  const db = await getDb();
  const p = v.profile;
  const [counts, stats, unread, bought, sold, payout] = await Promise.all([
    one<{ services: number; portfolio: number; saved: number; following: number }>(
      db,
      `select (select count(*)::int from services where owner_id = $1) as services, (select count(*)::int from portfolio_items where owner_id = $1) as portfolio,
         (select count(*)::int from favorites where user_id = $1) as saved, (select count(*)::int from follows where follower_id = $1) as following`,
      [v.user.id],
    ),
    profileStats(db, v.user.id),
    unreadCount(db, v.user.id),
    ordersFor(db, v.user.id, "buyer"),
    ordersFor(db, v.user.id, "seller"),
    payoutAccount(db, v.user.id),
  ]);
  const c = counts!;
  const completeness = profileCompleteness(p, c);
  const todo = [
    ...bought.filter((o) => ["quoted", "awaiting_payment", "delivered"].includes(o.status)).map((o) => ({ o, role: "Gekocht" })),
    ...sold.filter((o) => ["requested", "in_progress"].includes(o.status)).map((o) => ({ o, role: "Verkocht" })),
  ];
  const earned = sold.filter((o) => o.status === "completed").reduce((s, o) => s + (o.seller_amount_cents ?? 0), 0);
  const selling = c.services > 0 || c.portfolio > 0 || p.published;

  return (
    <>
      <div>
        <p className="eyebrow">Dashboard</p>
        <h1 style={{ margin: 0 }}>Hoi {p.display_name.split(" ")[0]}</h1>
      </div>

      {completeness.done < completeness.total && (
        <section className="card raised stack" aria-labelledby="start">
          <div className="row between">
            <h2 id="start" style={{ fontSize: "1.3rem", margin: 0 }}>
              {selling ? "Maak je profiel af" : "Zet je talent online"}
            </h2>
            <span className="small muted">
              {completeness.done} van {completeness.total}
            </span>
          </div>
          <div className="progress-bar" aria-hidden="true">
            <span style={{ width: `${(completeness.done / completeness.total) * 100}%` }} />
          </div>
          <ul className="choices">
            {completeness.steps.map((s) => (
              <li key={s.label} className={`chip${s.done ? " on" : ""}`} style={{ listStyle: "none" }}>
                {s.done ? "✓ " : ""}
                {s.label}
              </li>
            ))}
          </ul>
          <div className="row">
            <Link href="/dashboard/profiel" className="btn">
              Profiel bewerken <Arrow />
            </Link>
            <Link href="/dashboard/portfolio" className="btn secondary">
              Werk toevoegen
            </Link>
            <Link href="/dashboard/diensten/nieuw" className="btn secondary">
              Dienst maken
            </Link>
          </div>
        </section>
      )}

      <section className="grid-4" aria-label="Cijfers">
        <Link href="/opdrachten" className="stat" style={{ textDecoration: "none" }}>
          <div className="label">Actie nodig</div>
          <div className="value">{todo.length}</div>
        </Link>
        <Link href="/berichten" className="stat" style={{ textDecoration: "none" }}>
          <div className="label">Ongelezen berichten</div>
          <div className="value">{unread}</div>
        </Link>
        <div className="stat">
          <div className="label">Volgers</div>
          <div className="value">{stats.followers}</div>
        </div>
        <div className="stat">
          <div className="label">Verdiend (afgerond, na kosten)</div>
          <div className="value">{formatEuro(earned) || "€ 0"}</div>
        </div>
      </section>

      <section className="stack" aria-labelledby="todo">
        <h2 id="todo" style={{ fontSize: "1.3rem", margin: 0 }}>
          Te doen
        </h2>
        {todo.length === 0 ? (
          <p className="muted">Niets dat op jou wacht.</p>
        ) : (
          <ul className="list">
            {todo.map(({ o, role }) => (
              <li key={o.id}>
                <Link href={`/opdrachten/${o.id}`} className="order-row">
                  <span className="t">{o.title}</span>
                  <span className="amount">{o.price_cents != null ? formatEuro(o.price_cents) : "Offerte"}</span>
                  <span className="small muted">
                    {role} · SY-{o.ref} · {ago(o.updated_at)}
                  </span>
                  <span className={`status s-${o.status}`} style={{ justifySelf: "end" }}>
                    {STATUS_LABEL[o.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid-3" aria-label="Snel naar">
        <Link href="/dashboard/diensten" className="card" style={{ textDecoration: "none" }}>
          <h3>Diensten</h3>
          <p className="muted small" style={{ margin: 0 }}>
            {c.services} {c.services === 1 ? "dienst" : "diensten"}
          </p>
        </Link>
        <Link href="/dashboard/portfolio" className="card" style={{ textDecoration: "none" }}>
          <h3>Portfolio</h3>
          <p className="muted small" style={{ margin: 0 }}>
            {c.portfolio} {c.portfolio === 1 ? "item" : "items"}
          </p>
        </Link>
        <Link href="/dashboard/uitbetalingen" className="card" style={{ textDecoration: "none" }}>
          <h3>Uitbetalingen</h3>
          <p className="muted small" style={{ margin: 0 }}>
            {canReceive(payout) ? "Ingesteld" : payout ? "Nog niet afgerond" : "Nog niet ingesteld"}
          </p>
        </Link>
        <Link href="/bewaard" className="card" style={{ textDecoration: "none" }}>
          <h3>Bewaard &amp; volgend</h3>
          <p className="muted small" style={{ margin: 0 }}>
            {c.saved} bewaard · {c.following} gevolgd
          </p>
        </Link>
        <Link href={`/@${p.username}#reviews`} className="card" style={{ textDecoration: "none" }}>
          <h3>Reviews</h3>
          <p className="muted small" style={{ margin: 0 }}>
            {stats.reviews === 0 ? "Nog geen reviews" : `${stats.reviews} · gemiddeld ${stats.rating?.toLocaleString("nl-NL")}`}
          </p>
        </Link>
        <Link href="/account" className="card" style={{ textDecoration: "none" }}>
          <h3>Account</h3>
          <p className="muted small" style={{ margin: 0 }}>
            {v.user.email}
          </p>
        </Link>
      </section>
    </>
  );
}
