import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Dialog } from "@/components/Dialog";
import { ReportForm } from "@/components/forms/SafetyForms";
import { Arrow } from "@/components/Icons";
import { ShareButton } from "@/components/Share";
import { SaveButton } from "@/components/Toggles";
import { Avatar } from "@/components/Visuals";
import { viewer } from "@/lib/access";
import { categoryLabel } from "@/lib/config";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getPortfolioItem } from "@/lib/portfolio";
import { savedIds } from "@/lib/social";

export async function generateMetadata(props: PageProps<"/werk/[id]">): Promise<Metadata> {
  const w = await getPortfolioItem(await getDb(), (await props.params).id);
  return w ? { title: `${w.title} · ${w.owner.display_name}` } : { title: "Niet gevonden" };
}

export default async function WorkPage(props: PageProps<"/werk/[id]">) {
  const { id } = await props.params;
  const v = await viewer();
  const db = await getDb();
  const w = await getPortfolioItem(db, id, v?.user.id);
  if (!w) notFound();
  const own = v?.user.id === w.owner_id;
  const saved = await savedIds(db, v?.user.id);
  return (
    <div className="container page">
      <div className="split wide-side">
        <div className="media-frame" style={{ background: "#000" }}>
          {w.media_kind === "video" ? (
            <video src={w.media_url} controls playsInline preload="metadata" style={{ maxHeight: "80dvh", objectFit: "contain" }}>
              <track kind="captions" />
            </video>
          ) : (
            <img src={w.media_url} alt={w.title} style={{ maxHeight: "80dvh", objectFit: "contain" }} />
          )}
        </div>
        <aside className="sticky-side stack">
          {own && !w.visible && (
            <p className="notice warn small">
              {w.hidden_at ? `Verborgen door moderatie: ${w.hidden_reason}` : "Alleen jij ziet dit werk."}
            </p>
          )}
          <p className="eyebrow">{categoryLabel(w.category)}</p>
          <h1 style={{ fontSize: "2.2rem", margin: 0 }}>{w.title}</h1>
          <Link href={`/@${w.owner.username}`} className="byline" style={{ fontSize: "1rem" }}>
            <Avatar name={w.owner.display_name} url={w.owner.avatar_url} size={36} />
            <span>
              <strong style={{ color: "var(--ink)" }}>{w.owner.display_name}</strong> · {formatDate(w.created_at)}
            </span>
          </Link>
          {w.description && <p className="pre muted">{w.description}</p>}
          <div className="row">
            {!own && (
              <SaveButton
                type="portfolio"
                id={w.id}
                saved={saved.has(w.id)}
                loggedIn={Boolean(v?.profile)}
                title={w.title}
                variant="button"
              />
            )}
            <ShareButton path={`/werk/${w.id}`} title={w.title} />
          </div>
          {!own && (
            <Link href={`/@${w.owner.username}#diensten`} className="btn block">
              Bekijk diensten van {w.owner.display_name} <Arrow />
            </Link>
          )}
          {own && (
            <Link href="/dashboard/portfolio" className="btn white">
              Portfolio beheren
            </Link>
          )}
          {v && !own && (
            <Dialog trigger="Melden" triggerClassName="btn ghost small" title="Werk melden">
              <ReportForm context="portfolio" contextId={w.id} name={w.owner.display_name} />
            </Dialog>
          )}
        </aside>
      </div>
    </div>
  );
}
