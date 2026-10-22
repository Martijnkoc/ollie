import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ServiceForm } from "@/components/forms/ServiceForm";
import { requireActive } from "@/lib/access";
import { PLATFORM_FEE_BPS } from "@/lib/config";
import { getDb } from "@/lib/db";
import { getService } from "@/lib/services";

export const metadata: Metadata = { title: "Dienst bewerken", robots: { index: false } };

const euros = (c: number | null) =>
  c == null ? "" : (c / 100).toLocaleString("nl-NL", { minimumFractionDigits: c % 100 ? 2 : 0 }).replace(/\./g, "");

export default async function EditService(props: PageProps<"/dashboard/diensten/[id]">) {
  const { id } = await props.params;
  const v = await requireActive(`/dashboard/diensten/${id}`);
  const s = await getService(await getDb(), id, v.user.id);
  if (!s || s.owner_id !== v.user.id) notFound();
  return (
    <>
      <div className="row between">
        <div>
          <p className="eyebrow">Dienst bewerken</p>
          <h1 style={{ margin: 0 }}>{s.title}</h1>
        </div>
        <Link href={`/diensten/${s.id}`} className="btn secondary">
          Bekijken
        </Link>
      </div>
      {s.hidden_at && <p className="notice error">Verborgen door moderatie: {s.hidden_reason}</p>}
      <ServiceForm
        serviceId={s.id}
        feePercent={PLATFORM_FEE_BPS / 100}
        d={{
          kind: s.kind,
          title: s.title,
          summary: s.summary,
          description: s.description,
          category: s.category,
          includes: s.includes.join("\n"),
          price: euros(s.price_cents),
          deliveryDays: s.delivery_days == null ? "" : String(s.delivery_days),
          locationMode: s.location_mode,
          coverId: s.cover_id,
          coverUrl: s.cover_url,
          status: s.status,
          extras: s.extras.map((e) => ({ title: e.title, price: euros(e.price_cents), days: String(e.extra_days) })),
        }}
      />
    </>
  );
}
