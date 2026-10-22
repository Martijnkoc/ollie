import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/Empty";
import { FeedGrid } from "@/components/Tiles";
import { FollowButton } from "@/components/Toggles";
import { Avatar } from "@/components/Visuals";
import { requireActive } from "@/lib/access";
import { getDb } from "@/lib/db";
import type { FeedItem } from "@/lib/feed";
import { OWNER_PUBLIC } from "@/lib/services";
import { mediaUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Bewaard en volgend", robots: { index: false } };

export default async function SavedPage() {
  const v = await requireActive("/bewaard");
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select f.created_at as saved_at, s.id as service_id, s.title as s_title, s.summary, s.category as s_category, s.kind, s.price_cents, s.delivery_days, s.location_mode,
       sc.storage_key as cover_key, i.id as work_id, i.title as w_title, i.category as w_category, im.storage_key as work_key, im.kind as media_kind,
       p.user_id, p.username, p.display_name, av.storage_key as avatar_key, p.city
     from favorites f
     left join services s on s.id = f.service_id and s.status = 'published' and s.hidden_at is null
     left join portfolio_items i on i.id = f.portfolio_id and i.published and i.hidden_at is null
     left join media sc on sc.id = s.cover_id left join media im on im.id = i.media_id
     join profiles p on p.user_id = coalesce(s.owner_id, i.owner_id) join users u on u.id = p.user_id
     left join media av on av.id = p.avatar_id
     where f.user_id = $1 and ${OWNER_PUBLIC}
       and not exists (select 1 from blocks b where (b.blocker_id = $1 and b.blocked_id = p.user_id) or (b.blocked_id = $1 and b.blocker_id = p.user_id))
     order by f.created_at desc`,
    [v.user.id],
  );
  const items: FeedItem[] = rows.map((r) => {
    const owner = {
      user_id: r.user_id as string,
      username: r.username as string,
      display_name: r.display_name as string,
      avatar_url: mediaUrl(r.avatar_key as string | null),
      city: r.city as string,
    };
    return r.service_id
      ? {
          type: "service",
          id: r.service_id as string,
          title: r.s_title as string,
          summary: r.summary as string,
          category: r.s_category as string,
          kind: r.kind as "fixed" | "custom",
          price_cents: r.price_cents as number | null,
          delivery_days: r.delivery_days as number | null,
          location_mode: r.location_mode as string,
          cover_url: mediaUrl(r.cover_key as string | null),
          created_at: r.saved_at as Date,
          owner,
        }
      : {
          type: "work",
          id: r.work_id as string,
          title: r.w_title as string,
          category: r.w_category as string,
          media_url: mediaUrl(r.work_key as string)!,
          media_kind: r.media_kind as "image" | "video",
          created_at: r.saved_at as Date,
          owner,
        };
  });
  const following = await db.query<{
    user_id: string;
    username: string;
    display_name: string;
    headline: string;
    avatar_key: string | null;
  }>(
    `select p.user_id, p.username, p.display_name, p.headline, av.storage_key as avatar_key from follows f join profiles p on p.user_id = f.followee_id
     join users u on u.id = p.user_id left join media av on av.id = p.avatar_id where f.follower_id = $1 and ${OWNER_PUBLIC} order by f.created_at desc`,
    [v.user.id],
  );
  return (
    <div className="container page stack-lg">
      <div>
        <p className="eyebrow">Bewaard en volgend</p>
        <h1 style={{ margin: 0 }}>Je verzameling</h1>
      </div>
      <section className="stack" aria-labelledby="volgend">
        <div className="row between">
          <h2 id="volgend" style={{ fontSize: "1.4rem", margin: 0 }}>
            Makers die je volgt ({following.length})
          </h2>
          {following.length > 0 && (
            <Link href="/ontdek?volgend=1" className="btn secondary small">
              Hun nieuwste werk
            </Link>
          )}
        </div>
        {following.length === 0 ? (
          <p className="muted">Je volgt nog niemand. Volg makers om hun nieuwe werk en diensten als eerste te zien.</p>
        ) : (
          <ul className="grid-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {following.map((m) => (
              <li key={m.user_id} className="card tight row between">
                <Link href={`/@${m.username}`} className="byline" style={{ fontSize: "0.95rem" }}>
                  <Avatar name={m.display_name} url={mediaUrl(m.avatar_key)} size={40} />
                  <span>
                    <strong style={{ color: "var(--ink)" }}>{m.display_name}</strong>
                    <br />
                    <span className="small">{m.headline}</span>
                  </span>
                </Link>
                <FollowButton userId={m.user_id} following loggedIn name={m.display_name} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="stack" aria-labelledby="bewaard">
        <h2 id="bewaard" style={{ fontSize: "1.4rem", margin: 0 }}>
          Bewaard ({items.length})
        </h2>
        {items.length === 0 ? (
          <Empty title="Nog niets bewaard">
            <p>Tik op het bladwijzer-icoon bij werk of een dienst om het hier terug te vinden.</p>
            <Link href="/ontdek" className="btn">
              Ontdek talent
            </Link>
          </Empty>
        ) : (
          <FeedGrid items={items} ctx={{ saved: new Set(items.map((i) => i.id)), loggedIn: true }} />
        )}
      </section>
    </div>
  );
}
