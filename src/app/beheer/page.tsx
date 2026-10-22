import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/access";
import { getDb, one } from "@/lib/db";

export const metadata: Metadata = { title: "Beheer", robots: { index: false } };

export default async function StaffHome() {
  await requireStaff();
  const s = (await one<Record<string, number>>(
    await getDb(),
    `select (select count(*)::int from users) as users,
       (select count(*)::int from profiles where published and hidden_at is null) as public_profiles,
       (select count(*)::int from services where status = 'published' and hidden_at is null) as services,
       (select count(*)::int from portfolio_items where hidden_at is null) as portfolio,
       (select count(*)::int from orders where status in ('in_progress', 'delivered')) as running,
       (select count(*)::int from orders where status = 'completed') as completed,
       (select count(*)::int from orders where status = 'disputed') as disputed,
       (select count(*)::int from orders where status = 'completed' and payment_status = 'paid' and transfer_status in ('pending', 'failed')) as payouts_waiting,
       (select count(*)::int from reports where status = 'open') as reports,
       (select count(*)::int from appeals where status = 'open') as appeals,
       (select count(*)::int from users where restricted_at is not null) as restricted`,
  ))!;
  const Stat = ({ label, value, href }: { label: string; value: number; href?: string }) =>
    href ? (
      <Link href={href} className="stat" style={{ textDecoration: "none" }}>
        <div className="label">{label}</div>
        <div className="value">{value}</div>
      </Link>
    ) : (
      <div className="stat">
        <div className="label">{label}</div>
        <div className="value">{value}</div>
      </div>
    );
  return (
    <>
      <h1>Beheer</h1>
      <section className="grid-4" aria-label="Te behandelen">
        <Stat label="Open meldingen" value={s.reports} href="/beheer/meldingen" />
        <Stat label="Klachten" value={s.disputed} href="/beheer/klachten" />
        <Stat label="Open bezwaren" value={s.appeals} href="/beheer/bezwaren" />
        <Stat label="Uitbetalingen in de wacht" value={s.payouts_waiting} />
      </section>
      <section className="grid-4" aria-label="Platform">
        <Stat label="Accounts" value={s.users} />
        <Stat label="Openbare profielen" value={s.public_profiles} />
        <Stat label="Gepubliceerde diensten" value={s.services} />
        <Stat label="Portfolio-items" value={s.portfolio} />
        <Stat label="Lopende opdrachten" value={s.running} />
        <Stat label="Afgeronde opdrachten" value={s.completed} />
        <Stat label="Beperkte accounts" value={s.restricted} />
      </section>
      <p className="small muted">Alleen totalen. Moderatoren zien berichten alleen bij een melding of klacht waar ze bij horen.</p>
    </>
  );
}
