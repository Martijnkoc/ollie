import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Dialog } from "@/components/Dialog";
import { ContactForm } from "@/components/forms/ContactForm";
import { ReportForm } from "@/components/forms/SafetyForms";
import { Arrow } from "@/components/Icons";
import { ReviewList } from "@/components/Reviews";
import { ShareButton } from "@/components/Share";
import { SaveButton } from "@/components/Toggles";
import { Avatar, TypeArt } from "@/components/Visuals";
import { viewer } from "@/lib/access";
import { LOCATION_MODES, categoryLabel, label } from "@/lib/config";
import { getDb } from "@/lib/db";
import { days } from "@/lib/format";
import { feePercentLabel, formatEuro } from "@/lib/money";
import { reviewsFor } from "@/lib/reviews";
import { getService } from "@/lib/services";
import { savedIds } from "@/lib/social";

export async function generateMetadata(props: PageProps<"/diensten/[id]">): Promise<Metadata> {
  const s = await getService(await getDb(), (await props.params).id);
  return s ? { title: s.title, description: s.summary || `${s.title} door ${s.owner.display_name}` } : { title: "Niet gevonden" };
}

export default async function ServicePage(props: PageProps<"/diensten/[id]">) {
  const { id } = await props.params;
  const v = await viewer();
  const db = await getDb();
  const s = await getService(db, id, v?.user.id);
  if (!s) notFound();
  const own = v?.user.id === s.owner_id;
  const [reviews, saved] = await Promise.all([reviewsFor(db, s.owner_id, { serviceId: s.id }), savedIds(db, v?.user.id)]);
  const loginNext = `/inloggen?next=${encodeURIComponent(`/diensten/${s.id}`)}`;
  const fixed = s.kind === "fixed";

  return (
    <div className="container page">
      {own && !s.visible && (
        <p className="notice warn" style={{ marginBottom: 24 }}>
          {s.hidden_at
            ? `Verborgen door moderatie: ${s.hidden_reason}`
            : s.status !== "published"
              ? "Voorbeeld: deze dienst is niet gepubliceerd."
              : "Voorbeeld: je profiel is nog niet openbaar, dus deze dienst is nog niet zichtbaar."}{" "}
          <Link href={`/dashboard/diensten/${s.id}`}>Bewerken</Link>
        </p>
      )}
      <div className="split wide-side">
        <div className="stack-lg">
          <div className="stack">
            <p className="eyebrow">
              <Link href={`/ontdek?categorie=${s.category}`} style={{ textDecoration: "none" }}>
                {categoryLabel(s.category)}
              </Link>
            </p>
            <h1 style={{ margin: 0 }}>{s.title}</h1>
            {s.summary && <p className="lead">{s.summary}</p>}
            <Link href={`/@${s.owner.username}`} className="byline" style={{ fontSize: "1rem" }}>
              <Avatar name={s.owner.display_name} url={s.owner.avatar_url} size={36} />
              <span>
                <strong style={{ color: "var(--ink)" }}>{s.owner.display_name}</strong> · @{s.owner.username}
                {s.owner.city && ` · ${s.owner.city}`}
              </span>
            </Link>
          </div>
          <div className="media-frame service-hero">
            {s.cover_url ? (
              <img src={s.cover_url} alt="" />
            ) : (
              <TypeArt seed={s.id} title={s.title} kicker={categoryLabel(s.category)} className="service-hero" style={{ height: "100%" }} />
            )}
          </div>
          <section className="stack" aria-labelledby="omschrijving">
            <h2 id="omschrijving" style={{ fontSize: "1.5rem", margin: 0 }}>
              Omschrijving
            </h2>
            <p className="pre" style={{ maxWidth: "70ch" }}>
              {s.description || "Nog geen omschrijving."}
            </p>
          </section>
          {s.includes.length > 0 && (
            <section className="stack" aria-labelledby="inbegrepen">
              <h2 id="inbegrepen" style={{ fontSize: "1.5rem", margin: 0 }}>
                Wat is inbegrepen
              </h2>
              <ul className="checklist">
                {s.includes.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </section>
          )}
          {s.extras.length > 0 && (
            <section className="stack" aria-labelledby="uitbreidingen">
              <h2 id="uitbreidingen" style={{ fontSize: "1.5rem", margin: 0 }}>
                Uitbreidingen
              </h2>
              <ul className="divided">
                {s.extras.map((e) => (
                  <li key={e.id} className="row between">
                    <span>
                      {e.title}
                      {e.extra_days > 0 && <span className="faint small"> · +{days(e.extra_days)}</span>}
                    </span>
                    <strong>+ {formatEuro(e.price_cents)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="stack" aria-labelledby="reviews-h">
            <h2 id="reviews-h" style={{ fontSize: "1.5rem", margin: 0 }}>
              Reviews voor deze dienst
            </h2>
            <ReviewList reviews={reviews} sellerName={s.owner.display_name} viewerId={v?.user.id} sellerId={s.owner_id} />
          </section>
        </div>

        <aside className="sticky-side stack" aria-label="Boeken">
          <div className="price-panel stack">
            <div className="price">
              {fixed ? (
                formatEuro(s.price_cents)
              ) : s.price_cents ? (
                <>
                  <small>vanaf </small>
                  {formatEuro(s.price_cents)}
                </>
              ) : (
                <small>Prijs op offerte</small>
              )}
            </div>
            <div className={`booking-mode${fixed ? "" : " talk"}`}>
              <span className="dot" aria-hidden="true" />
              <span>
                <strong>{fixed ? "Direct te boeken" : "Eerst overleg"}</strong>
                {fixed
                  ? `Vaste prijs, levering in ${days(s.delivery_days)} na betaling.`
                  : "Je stuurt een aanvraag, stelt vragen en krijgt een offerte. Pas als je die accepteert, is er een afspraak."}
              </span>
            </div>
            <dl className="kv">
              <dt>Waar</dt>
              <dd>{label(LOCATION_MODES, s.location_mode)}</dd>
              <dt>Verkoper</dt>
              <dd>{s.owner.seller_type === "business" ? `Zakelijk · KvK ${s.owner.kvk_number}` : "Particulier"}</dd>
            </dl>
            {!own &&
              (fixed ? (
                <Link
                  href={v?.profile ? `/bestellen/${s.id}` : `/inloggen?next=${encodeURIComponent(`/bestellen/${s.id}`)}`}
                  className="btn large block"
                >
                  Bestellen <Arrow />
                </Link>
              ) : (
                <Link
                  href={
                    v?.profile
                      ? `/aanvragen/${s.owner.username}?dienst=${s.id}`
                      : `/inloggen?next=${encodeURIComponent(`/aanvragen/${s.owner.username}?dienst=${s.id}`)}`
                  }
                  className="btn large block"
                >
                  Offerte aanvragen <Arrow />
                </Link>
              ))}
            {!own && (
              <div className="row">
                {v?.profile ? (
                  <Dialog trigger="Vraag stellen" triggerClassName="btn secondary" title={`Vraag aan ${s.owner.display_name}`}>
                    <ContactForm userId={s.owner_id} name={s.owner.display_name} about={s.title} />
                  </Dialog>
                ) : (
                  <Link href={loginNext} className="btn secondary">
                    Vraag stellen
                  </Link>
                )}
                <SaveButton
                  type="service"
                  id={s.id}
                  saved={saved.has(s.id)}
                  loggedIn={Boolean(v?.profile)}
                  title={s.title}
                  variant="button"
                />
                <ShareButton path={`/diensten/${s.id}`} title={s.title} className="btn ghost" />
              </div>
            )}
            {own && (
              <Link href={`/dashboard/diensten/${s.id}`} className="btn white block">
                Dienst bewerken
              </Link>
            )}
          </div>
          <p className="tiny faint">
            {s.owner.seller_type === "business"
              ? "Je koopt bij een zakelijke verkoper; het consumentenrecht (zoals herroepingsrecht) is van toepassing."
              : "Je koopt bij een particulier. Het consumentenrecht voor aankopen bij bedrijven geldt dan niet. "}{" "}
            Je betaalt via Sell Yourself; de maker krijgt het geld pas na jouw goedkeuring. Platformkosten ({feePercentLabel()}) betaalt de
            maker.
          </p>
          {v && !own && (
            <Dialog trigger="Dienst melden" triggerClassName="btn ghost small" title="Dienst melden">
              <ReportForm context="service" contextId={s.id} name={s.owner.display_name} />
            </Dialog>
          )}
        </aside>
      </div>
    </div>
  );
}
