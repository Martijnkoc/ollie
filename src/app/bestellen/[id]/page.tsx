import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlaceOrderForm } from "@/components/forms/OrderForms";
import { Avatar } from "@/components/Visuals";
import { requireActive } from "@/lib/access";
import { PLATFORM_FEE_BPS } from "@/lib/config";
import { getDb } from "@/lib/db";
import { canReceive, payoutAccount } from "@/lib/payments";
import { stripeMode } from "@/lib/payments-client";
import { getService } from "@/lib/services";

export const metadata: Metadata = { title: "Bestellen", robots: { index: false } };

export default async function OrderPage(props: PageProps<"/bestellen/[id]">) {
  const { id } = await props.params;
  const v = await requireActive(`/bestellen/${id}`);
  const db = await getDb();
  const s = await getService(db, id, v.user.id);
  if (!s || !s.visible) notFound();
  if (s.owner_id === v.user.id) redirect(`/diensten/${s.id}`);
  if (s.kind !== "fixed") redirect(`/aanvragen/${s.owner.username}?dienst=${s.id}`);
  const payable =
    stripeMode() === "none"
      ? "Let op: online betalen is in deze omgeving nog niet geconfigureerd. Je kunt bestellen, maar nog niet betalen; er wordt niets afgeschreven."
      : !canReceive(await payoutAccount(db, s.owner_id))
        ? `${s.owner.display_name} heeft uitbetalingen nog niet ingesteld. Je kunt bestellen; betalen kan zodra dat geregeld is.`
        : null;
  return (
    <div className="container mid page">
      <div className="split">
        <div className="stack-lg">
          <div>
            <p className="eyebrow">Bestellen</p>
            <h1 style={{ marginBottom: 8 }}>{s.title}</h1>
            <Link href={`/@${s.owner.username}`} className="byline">
              <Avatar name={s.owner.display_name} url={s.owner.avatar_url} size={28} />
              <span>{s.owner.display_name}</span>
            </Link>
          </div>
          <PlaceOrderForm
            serviceId={s.id}
            basePrice={s.price_cents!}
            baseDays={s.delivery_days!}
            extras={s.extras}
            feePercent={PLATFORM_FEE_BPS / 100}
            onSite={s.location_mode === "on_site"}
            payable={payable}
          />
        </div>
        <aside className="sticky-side stack">
          <div className="card stack">
            <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Zo werkt het</h2>
            <ol className="small muted" style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 8 }}>
              <li>Je bestelt en betaalt via Sell Yourself.</li>
              <li>De maker gaat aan de slag. Vragen stel je in de chat bij je opdracht.</li>
              <li>Na de oplevering keur je goed of vraag je om aanpassingen.</li>
              <li>
                Pas na jouw goedkeuring krijgt de maker het geld. Zonder reactie wordt een oplevering na 7 dagen automatisch goedgekeurd.
              </li>
            </ol>
          </div>
          <p className="tiny faint">
            Annuleren kan zolang de maker niet heeft opgeleverd: de maker kan altijd annuleren met volledige terugbetaling, en jij kunt zelf
            annuleren als de levertijd ruim is verstreken. Lees de <Link href="/hoe-het-werkt">uitleg over annuleren en klachten</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}
