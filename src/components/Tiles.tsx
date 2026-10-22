import Link from "next/link";
import { AVAILABILITY, categoryLabel, label } from "@/lib/config";
import type { FeedItem, FeedMaker, FeedService, FeedWork } from "@/lib/feed";
import { days } from "@/lib/format";
import { formatEuro } from "@/lib/money";
import { Play } from "./Icons";
import { SaveButton } from "./Toggles";
import { Avatar, TypeArt } from "./Visuals";

type Ctx = { saved: Set<string>; loggedIn: boolean };

export function PriceLabel({ kind, price }: { kind: "fixed" | "custom"; price: number | null }) {
  if (kind === "fixed") return <span className="tile-price">{formatEuro(price)}</span>;
  return (
    <span className="tile-price">
      {price ? (
        <>
          <small>vanaf </small>
          {formatEuro(price)}
        </>
      ) : (
        <small>Prijs op offerte</small>
      )}
    </span>
  );
}

export function ServiceTile({ item, ctx }: { item: FeedService; ctx: Ctx }) {
  return (
    <article className="tile">
      <div className="media-frame" style={{ aspectRatio: "4 / 3" }}>
        {item.cover_url ? (
          <img src={item.cover_url} alt="" loading="lazy" decoding="async" />
        ) : (
          <TypeArt seed={item.id} title={item.title} kicker={categoryLabel(item.category)} style={{ height: "100%" }} />
        )}
      </div>
      <div className="tile-kicker">
        <span className={`badge ${item.kind === "fixed" ? "lime" : ""}`}>{item.kind === "fixed" ? "Direct boeken" : "Op aanvraag"}</span>
      </div>
      <div className="tile-save">
        <SaveButton type="service" id={item.id} saved={ctx.saved.has(item.id)} loggedIn={ctx.loggedIn} title={item.title} />
      </div>
      <div className="tile-body stack-sm">
        <h3 className="tile-title">
          <Link href={`/diensten/${item.id}`}>{item.title}</Link>
        </h3>
        <div className="tile-meta">
          <span className="byline">
            <Avatar name={item.owner.display_name} url={item.owner.avatar_url} size={24} />
            <span>{item.owner.display_name}</span>
          </span>
          <PriceLabel kind={item.kind} price={item.price_cents} />
        </div>
        {item.kind === "fixed" && item.delivery_days && (
          <p className="tiny faint" style={{ margin: 0 }}>
            Levering in {days(item.delivery_days)}
          </p>
        )}
      </div>
    </article>
  );
}

export function WorkTile({ item, ctx }: { item: FeedWork; ctx: Ctx }) {
  return (
    <article className="tile">
      <div className="media-frame">
        {item.media_kind === "video" ? (
          <video src={`${item.media_url}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true" />
        ) : (
          <img src={item.media_url} alt={item.title} loading="lazy" decoding="async" />
        )}
      </div>
      <div className="tile-kicker">
        <span className="badge">Werk{item.media_kind === "video" ? " · video" : ""}</span>
        {item.media_kind === "video" && (
          <span className="badge lime" aria-hidden="true">
            <Play className="" />
          </span>
        )}
      </div>
      <div className="tile-save">
        <SaveButton type="portfolio" id={item.id} saved={ctx.saved.has(item.id)} loggedIn={ctx.loggedIn} title={item.title} />
      </div>
      <div className="tile-body">
        <h3 className="tile-title" style={{ fontSize: "1rem" }}>
          <Link href={`/werk/${item.id}`}>{item.title}</Link>
        </h3>
        <span className="byline">
          <Avatar name={item.owner.display_name} url={item.owner.avatar_url} size={24} />
          <span>
            {item.owner.display_name} · {categoryLabel(item.category)}
          </span>
        </span>
      </div>
    </article>
  );
}

export function MakerTile({ item }: { item: FeedMaker }) {
  return (
    <article className="tile">
      <div className="media-frame" style={{ aspectRatio: "16 / 10" }}>
        {item.cover_url ? (
          <img src={item.cover_url} alt="" loading="lazy" decoding="async" />
        ) : (
          <TypeArt seed={item.username} title={categoryLabel(item.categories[0] ?? "overig")} style={{ height: "100%" }} />
        )}
      </div>
      <div className="tile-kicker">
        <span className="badge outline" style={{ background: "rgb(16 17 18 / 72%)", color: "#fff" }}>
          Maker
        </span>
      </div>
      <div className="tile-body stack-sm">
        <div className="row" style={{ marginTop: -40, position: "relative", zIndex: 2 }}>
          <Avatar name={item.display_name} url={item.avatar_url} size={56} className="lime" />
        </div>
        <h3 className="tile-title">
          <Link href={`/@${item.username}`}>{item.display_name}</Link>
        </h3>
        {item.headline && (
          <p className="small muted" style={{ margin: 0 }}>
            {item.headline}
          </p>
        )}
        <p className="tiny faint" style={{ margin: 0 }}>
          {[item.city, item.works_remote ? "ook op afstand" : null, label(AVAILABILITY, item.availability)].filter(Boolean).join(" · ")}
        </p>
      </div>
    </article>
  );
}

export function FeedGrid({ items, ctx }: { items: FeedItem[]; ctx: Ctx }) {
  return (
    <div className="masonry">
      {items.map((item) =>
        item.type === "service" ? (
          <ServiceTile key={`s-${item.id}`} item={item} ctx={ctx} />
        ) : item.type === "work" ? (
          <WorkTile key={`w-${item.id}`} item={item} ctx={ctx} />
        ) : (
          <MakerTile key={`m-${item.id}`} item={item} />
        ),
      )}
    </div>
  );
}
