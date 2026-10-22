import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Dialog } from "@/components/Dialog";
import { Empty } from "@/components/Empty";
import { ContactForm } from "@/components/forms/ContactForm";
import { BlockForm, ReportForm } from "@/components/forms/SafetyForms";
import { Arrow } from "@/components/Icons";
import { ReviewList } from "@/components/Reviews";
import { ShareButton } from "@/components/Share";
import { ServiceTile, WorkTile } from "@/components/Tiles";
import { FollowButton } from "@/components/Toggles";
import { Avatar, Stars, TypeArt } from "@/components/Visuals";
import { isPublic, viewer } from "@/lib/access";
import { AVAILABILITY, REGIONS, categoryLabel, label } from "@/lib/config";
import { getDb } from "@/lib/db";
import { formatMonthYear } from "@/lib/format";
import { portfolioOf } from "@/lib/portfolio";
import { profileByUsername, profileStats } from "@/lib/profiles";
import { reviewsFor } from "@/lib/reviews";
import { servicesOf } from "@/lib/services";
import { isFollowing, savedIds } from "@/lib/social";

function usernameFrom(handle: string) {
  const h = decodeURIComponent(handle);
  return h.startsWith("@") ? h.slice(1) : null;
}

export async function generateMetadata(props: PageProps<"/[handle]">): Promise<Metadata> {
  const username = usernameFrom((await props.params).handle);
  if (!username) return {};
  const p = await profileByUsername(await getDb(), username);
  if (!p) return { title: "Niet gevonden" };
  return { title: `${p.display_name} (@${p.username})`, description: p.headline || `${p.display_name} op Sell Yourself` };
}

export default async function ProfilePage(props: PageProps<"/[handle]">) {
  const username = usernameFrom((await props.params).handle);
  if (!username) notFound();
  const v = await viewer();
  const db = await getDb();
  const p = await profileByUsername(db, username, v?.user.id);
  if (!p) notFound();
  const own = v?.user.id === p.user_id;
  const [services, work, reviews, stats, following, saved] = await Promise.all([
    servicesOf(db, p.user_id, { includeHidden: false }),
    portfolioOf(db, p.user_id, { includeHidden: false }),
    reviewsFor(db, p.user_id),
    profileStats(db, p.user_id),
    isFollowing(db, v?.user.id, p.user_id),
    savedIds(db, v?.user.id),
  ]);
  const ctx = { saved, loggedIn: Boolean(v?.profile) };
  const region = label(REGIONS, p.region);
  const where = [p.city, p.region && p.city !== region ? region : null].filter(Boolean).join(", ");
  const loginNext = `/inloggen?next=${encodeURIComponent(`/@${p.username}`)}`;

  return (
    <article>
      {own && !isPublic(p) && (
        <div className="notice warn" style={{ borderRadius: 0, textAlign: "center" }}>
          {p.hidden_at ? `Je profiel is verborgen door moderatie: ${p.hidden_reason}` : "Voorbeeld: je profiel is nog niet openbaar."}{" "}
          <Link href="/dashboard/profiel">Profiel bewerken</Link>
        </div>
      )}
      <div className="cover">
        {p.cover_url ? (
          <img src={p.cover_url} alt="" />
        ) : (
          <TypeArt
            seed={p.username}
            title={p.categories.map(categoryLabel).join(" · ") || p.display_name}
            className="cover"
            style={{ height: "100%" }}
          />
        )}
      </div>
      <div className="container">
        <header className="profile-head">
          <Avatar name={p.display_name} url={p.avatar_url} size={null} className="lime" />
          <div className="stack-sm">
            <h1>{p.display_name}</h1>
            <p className="handle" style={{ margin: 0 }}>
              @{p.username}
            </p>
            {p.headline && (
              <p className="lead" style={{ margin: "6px 0 0", color: "var(--ink)" }}>
                {p.headline}
              </p>
            )}
          </div>
          <div className="row">
            {own ? (
              <Link href="/dashboard/profiel" className="btn white">
                Profiel bewerken
              </Link>
            ) : (
              <>
                <FollowButton userId={p.user_id} following={following} loggedIn={Boolean(v?.profile)} name={p.display_name} />
                {v?.profile ? (
                  <Dialog trigger="Bericht" triggerClassName="btn secondary" title={`Bericht aan ${p.display_name}`}>
                    <ContactForm userId={p.user_id} name={p.display_name} />
                  </Dialog>
                ) : (
                  <Link href={loginNext} className="btn secondary">
                    Bericht
                  </Link>
                )}
              </>
            )}
            <ShareButton path={`/@${p.username}`} title={`${p.display_name} op Sell Yourself`} />
          </div>
        </header>

        <ul className="facts" style={{ marginTop: 24 }} aria-label="Over deze maker">
          {where && <li>{where}</li>}
          {p.works_remote && <li>Werkt ook op afstand</li>}
          {p.travel_km != null && p.travel_km > 0 && <li>Werkgebied {p.travel_km} km</li>}
          <li>
            <strong>{label(AVAILABILITY, p.availability)}</strong>
            {p.availability_note && ` · ${p.availability_note}`}
          </li>
          <li>{p.seller_type === "business" ? `Zakelijke verkoper · KvK ${p.kvk_number}` : "Particuliere aanbieder"}</li>
          <li>
            <strong>{stats.followers}</strong> {stats.followers === 1 ? "volger" : "volgers"}
          </li>
          {stats.rating != null && (
            <li>
              <Stars rating={stats.rating} /> <strong>{stats.rating.toLocaleString("nl-NL")}</strong> ({stats.reviews}{" "}
              {stats.reviews === 1 ? "review" : "reviews"})
            </li>
          )}
          {stats.completed > 0 && (
            <li>
              <strong>{stats.completed}</strong> afgeronde {stats.completed === 1 ? "opdracht" : "opdrachten"}
            </li>
          )}
          <li className="faint">Lid sinds {formatMonthYear(p.created_at)}</li>
        </ul>

        <nav
          className="tabs"
          aria-label="Profiel"
          style={{ marginTop: 32, position: "sticky", top: "var(--header-h)", background: "var(--midnight)", zIndex: 5 }}
        >
          <a href="#diensten">Diensten {services.length > 0 && <span className="faint">{services.length}</span>}</a>
          <a href="#werk">Portfolio {work.length > 0 && <span className="faint">{work.length}</span>}</a>
          <a href="#reviews">Reviews {stats.reviews > 0 && <span className="faint">{stats.reviews}</span>}</a>
          <a href="#over">Over</a>
        </nav>

        <div className="stack-lg page" style={{ paddingTop: 40 }}>
          <section id="diensten" aria-labelledby="diensten-h" className="stack">
            <div className="row between">
              <h2 id="diensten-h" style={{ margin: 0, fontSize: "1.6rem" }}>
                Diensten
              </h2>
              {!own && p.availability !== "unavailable" && (
                <Link href={v?.profile ? `/aanvragen/${p.username}` : loginNext} className="btn secondary small">
                  Maatwerk aanvragen <Arrow />
                </Link>
              )}
            </div>
            {services.length === 0 ? (
              <p className="muted">
                {p.display_name} heeft nog geen vaste diensten. {!own && "Je kunt wel maatwerk aanvragen of een bericht sturen."}
              </p>
            ) : (
              <div className="grid-3">
                {services.map((s) => (
                  <ServiceTile
                    key={s.id}
                    ctx={ctx}
                    item={{
                      type: "service",
                      id: s.id,
                      title: s.title,
                      summary: s.summary,
                      category: s.category,
                      kind: s.kind,
                      price_cents: s.price_cents,
                      delivery_days: s.delivery_days,
                      location_mode: s.location_mode,
                      cover_url: s.cover_url,
                      created_at: s.created_at,
                      owner: {
                        user_id: p.user_id,
                        username: p.username,
                        display_name: p.display_name,
                        avatar_url: p.avatar_url,
                        city: p.city,
                      },
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <section id="werk" aria-labelledby="werk-h" className="stack">
            <h2 id="werk-h" style={{ margin: 0, fontSize: "1.6rem" }}>
              Portfolio
            </h2>
            {work.length === 0 ? (
              <Empty title="Nog geen werk">{own && <Link href="/dashboard/portfolio">Voeg je eerste werk toe</Link>}</Empty>
            ) : (
              <div className="masonry">
                {work.map((w) => (
                  <WorkTile
                    key={w.id}
                    ctx={ctx}
                    item={{
                      type: "work",
                      id: w.id,
                      title: w.title,
                      category: w.category,
                      media_url: w.media_url,
                      media_kind: w.media_kind,
                      created_at: w.created_at,
                      owner: {
                        user_id: p.user_id,
                        username: p.username,
                        display_name: p.display_name,
                        avatar_url: p.avatar_url,
                        city: p.city,
                      },
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <section id="reviews" aria-labelledby="reviews-h" className="stack">
            <h2 id="reviews-h" style={{ margin: 0, fontSize: "1.6rem" }}>
              Reviews
            </h2>
            <ReviewList reviews={reviews} sellerName={p.display_name} viewerId={v?.user.id} sellerId={p.user_id} />
          </section>

          <section id="over" aria-labelledby="over-h" className="stack">
            <h2 id="over-h" style={{ margin: 0, fontSize: "1.6rem" }}>
              Over {p.display_name}
            </h2>
            {p.bio ? (
              <p className="pre" style={{ maxWidth: "70ch" }}>
                {p.bio}
              </p>
            ) : (
              <p className="muted">Nog geen introductie.</p>
            )}
            {p.categories.length > 0 && (
              <div className="chips">
                {p.categories.map((c) => (
                  <Link key={c} href={`/ontdek?categorie=${c}`} className="chip">
                    {categoryLabel(c)}
                  </Link>
                ))}
              </div>
            )}
            {p.skills.length > 0 && (
              <ul className="tags" aria-label="Vaardigheden">
                {p.skills.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
            {p.website && (
              <p>
                <a href={p.website} rel="nofollow noopener noreferrer ugc" target="_blank">
                  {p.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              </p>
            )}
          </section>

          {v && !own && (
            <div className="row">
              <Dialog trigger="Profiel melden" triggerClassName="btn ghost small" title="Profiel melden">
                <ReportForm context="profile" contextId={p.user_id} name={p.display_name} />
              </Dialog>
              <Dialog trigger="Blokkeren" triggerClassName="btn ghost small" title={`${p.display_name} blokkeren`}>
                <BlockForm userId={p.user_id} name={p.display_name} />
              </Dialog>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
