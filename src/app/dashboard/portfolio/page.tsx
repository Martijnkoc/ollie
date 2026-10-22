import type { Metadata } from "next";
import Link from "next/link";
import { DeletePortfolioButton } from "@/components/CatalogActions";
import { Dialog } from "@/components/Dialog";
import { AddPortfolioForm, EditPortfolioForm } from "@/components/forms/PortfolioForms";
import { requireActive } from "@/lib/access";
import { categoryLabel } from "@/lib/config";
import { getDb } from "@/lib/db";
import { portfolioOf } from "@/lib/portfolio";
import { storageMode } from "@/lib/storage";

export const metadata: Metadata = { title: "Portfolio", robots: { index: false } };

export default async function PortfolioDashboard() {
  const v = await requireActive("/dashboard/portfolio");
  const items = await portfolioOf(await getDb(), v.user.id, { includeHidden: true });
  return (
    <>
      <div>
        <p className="eyebrow">Portfolio</p>
        <h1 style={{ margin: 0 }}>Laat je werk zien</h1>
        <p className="muted">Foto&apos;s en video&apos;s van wat je gemaakt hebt. Je beste werk eerst: het nieuwste staat bovenaan.</p>
      </div>
      {storageMode() === "none" ? (
        <p className="notice warn">Uploaden is in deze omgeving nog niet geconfigureerd: er is geen opslag ingesteld.</p>
      ) : (
        <AddPortfolioForm defaultCategory={v.profile.categories[0] ?? "creatief"} />
      )}
      <section className="stack" aria-labelledby="items">
        <h2 id="items" style={{ fontSize: "1.2rem", margin: 0 }}>
          Je werk ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="muted">Nog niets. Begin met één sterk beeld.</p>
        ) : (
          <div className="thumb-grid">
            {items.map((w) => (
              <article key={w.id} className="tile">
                <div className="media-frame" style={{ aspectRatio: "1" }}>
                  {w.media_kind === "video" ? (
                    <video src={`${w.media_url}#t=0.1`} muted playsInline preload="metadata" />
                  ) : (
                    <img src={w.media_url} alt={w.title} loading="lazy" />
                  )}
                </div>
                <div className="tile-body stack-sm">
                  <div className="row tight">
                    {!w.published && <span className="badge">Verborgen</span>}
                    {w.hidden_at && <span className="badge bad">Verborgen door moderatie</span>}
                    <span className="badge outline">{categoryLabel(w.category)}</span>
                  </div>
                  <Link href={`/werk/${w.id}`} style={{ fontWeight: 700 }}>
                    {w.title}
                  </Link>
                  <div className="row tight">
                    <Dialog trigger="Bewerken" triggerClassName="btn ghost small" title="Werk bewerken">
                      <EditPortfolioForm
                        id={w.id}
                        d={{ title: w.title, description: w.description, category: w.category, published: w.published }}
                      />
                    </Dialog>
                    <DeletePortfolioButton id={w.id} title={w.title} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
