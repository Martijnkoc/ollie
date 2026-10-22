import type { Metadata } from "next";
import Link from "next/link";
import { ServiceRowActions } from "@/components/CatalogActions";
import { Empty } from "@/components/Empty";
import { Plus } from "@/components/Icons";
import { TypeArt } from "@/components/Visuals";
import { isPublic, requireActive } from "@/lib/access";
import { categoryLabel } from "@/lib/config";
import { getDb } from "@/lib/db";
import { days } from "@/lib/format";
import { formatEuro } from "@/lib/money";
import { servicesOf } from "@/lib/services";

export const metadata: Metadata = { title: "Diensten", robots: { index: false } };

const STATUS: Record<string, string> = { published: "Gepubliceerd", draft: "Concept", paused: "Gepauzeerd" };

export default async function ServicesDashboard(props: PageProps<"/dashboard/diensten">) {
  const sp = await props.searchParams;
  const v = await requireActive("/dashboard/diensten");
  const services = await servicesOf(await getDb(), v.user.id, { includeHidden: true });
  return (
    <>
      <div className="row between">
        <div>
          <p className="eyebrow">Diensten</p>
          <h1 style={{ margin: 0 }}>Wat je verkoopt</h1>
        </div>
        <Link href="/dashboard/diensten/nieuw" className="btn">
          <Plus /> Nieuwe dienst
        </Link>
      </div>
      {sp.opgeslagen && (
        <p className="notice good" role="status">
          Opgeslagen.
        </p>
      )}
      {!isPublic(v.profile) && services.some((s) => s.status === "published") && (
        <p className="notice warn">
          Je profiel is nog niet openbaar, dus je gepubliceerde diensten zijn nog niet zichtbaar.{" "}
          <Link href="/dashboard/profiel">Maak je profiel openbaar</Link>
        </p>
      )}
      {services.length === 0 ? (
        <Empty title="Nog geen diensten">
          <p>Een dienst met een vaste prijs kan direct geboekt worden. Voor maatwerk stuur je een offerte.</p>
          <Link href="/dashboard/diensten/nieuw" className="btn">
            Maak je eerste dienst
          </Link>
        </Empty>
      ) : (
        <ul className="list">
          {services.map((s) => (
            <li key={s.id} className="card tight row" style={{ alignItems: "stretch", gap: 16 }}>
              <div className="media-frame" style={{ width: 120, aspectRatio: "4 / 3", flex: "none" }}>
                {s.cover_url ? (
                  <img src={s.cover_url} alt="" />
                ) : (
                  <TypeArt seed={s.id} title={categoryLabel(s.category)} style={{ height: "100%", padding: 10 }} />
                )}
              </div>
              <div className="stack-sm" style={{ flex: 1, minWidth: 200 }}>
                <div className="row tight">
                  <span className={`badge ${s.status === "published" && !s.hidden_at ? "lime" : ""}`}>
                    {s.hidden_at ? "Verborgen door moderatie" : STATUS[s.status]}
                  </span>
                  <span className="badge outline">{s.kind === "fixed" ? "Direct boeken" : "Op aanvraag"}</span>
                </div>
                <Link href={`/dashboard/diensten/${s.id}`} style={{ fontWeight: 700, fontSize: "1.05rem" }}>
                  {s.title}
                </Link>
                <span className="small muted">
                  {s.kind === "fixed"
                    ? `${formatEuro(s.price_cents)} · ${days(s.delivery_days)}`
                    : s.price_cents
                      ? `vanaf ${formatEuro(s.price_cents)}`
                      : "prijs op offerte"}{" "}
                  · {categoryLabel(s.category)}
                </span>
                {s.hidden_at && (
                  <span className="small" style={{ color: "var(--danger)" }}>
                    {s.hidden_reason}
                  </span>
                )}
              </div>
              <div className="stack-sm" style={{ alignSelf: "center" }}>
                <Link href={`/diensten/${s.id}`} className="btn ghost small">
                  Bekijken
                </Link>
                <ServiceRowActions id={s.id} status={s.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
