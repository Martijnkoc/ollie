import Link from "next/link";
import { ArrowUpRight, Arrow } from "@/components/Icons";
import { ServiceTile, WorkTile, PriceLabel } from "@/components/Tiles";
import { Avatar, TypeArt } from "@/components/Visuals";
import { viewer } from "@/lib/access";
import { CATEGORIES, HEADLINE, categoryLabel } from "@/lib/config";
import { getDb } from "@/lib/db";
import { feed } from "@/lib/feed";
import { categoryCounts, spotlight, wallImages } from "@/lib/home";
import { feePercentLabel } from "@/lib/money";
import { stripeMode } from "@/lib/payments-client";
import { savedIds } from "@/lib/social";

const TALENTS: [string, string][] = [
  ["Creator", "creators"],
  ["Fotograaf", "creatief"],
  ["Developer", "digitaal"],
  ["Schilder", "huis"],
  ["Coach", "coaching"],
  ["Videomaker", "creatief"],
  ["Dj", "muziek"],
  ["Installateur", "huis"],
  ["Designer", "digitaal"],
  ["Personal trainer", "sport"],
  ["Muzikant", "muziek"],
  ["Marketeer", "digitaal"],
  ["Illustrator", "creatief"],
  ["Timmerman", "huis"],
  ["Docent", "coaching"],
];

const SELL_LINK = "/inloggen?next=%2Fwelkom%3Fverkopen%3D1";

export default async function Home() {
  const db = await getDb();
  const v = await viewer();
  const [images, spot, counts, latest, saved] = await Promise.all([
    wallImages(db),
    spotlight(db),
    categoryCounts(db),
    feed(db, { kind: "all", limit: 8 }, v?.user.id),
    savedIds(db, v?.user.id),
  ]);
  const sellHref = v?.profile ? "/dashboard" : v ? "/welkom?verkopen=1" : SELL_LINK;
  const ctx = { saved, loggedIn: Boolean(v?.profile) };
  const showcase = latest.items.filter((i) => i.type !== "maker");

  // Three columns, each repeated so the slow scroll loops without a seam.
  const columns = [0, 1, 2].map((c) =>
    images.length >= 6 ? images.filter((_, i) => i % 3 === c) : TALENTS.filter((_, i) => i % 3 === c).map(([t, cat]) => ({ t, cat })),
  );

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">Voor creators, makers, freelancers en vakmensen</p>
            <h1 id="hero-title">
              <span className="line">Je hebt iets</span>
              <span className="line">te bieden.</span>
              <span className="line lime">Laat het zien.</span>
            </h1>
            <p className="lead">
              Ontdek talent, vind de juiste professional voor je klus, of verdien geld met wat jij kunt. Eén plek voor de fotograaf en de
              schilder, de developer en de coach, de creator en de dj.
            </p>
            <div className="hero-ctas">
              <Link href="/ontdek" className="btn large white">
                Ontdek talenten <Arrow />
              </Link>
              <Link href={sellHref} className="btn large">
                Verkoop jouw talent <Arrow />
              </Link>
            </div>
            <p className="hero-note">Gratis account. Geen abonnement. Verkopers betalen alleen {feePercentLabel()} als ze verdienen.</p>
          </div>
          <div
            className="wall"
            aria-hidden={images.length < 6 ? "true" : undefined}
            aria-label={images.length >= 6 ? "Recent werk van makers" : undefined}
          >
            {columns.map((col, c) => (
              <div className="wall-col" key={c}>
                {[0, 1].flatMap((rep) =>
                  col.map((item, i) =>
                    "url" in item ? (
                      <Link key={`${rep}-${item.id}`} href={`/werk/${item.id}`} className="wall-item" tabIndex={rep ? -1 : undefined}>
                        <img src={item.url} alt={rep ? "" : `${item.title}, door ${item.name}`} loading="lazy" decoding="async" />
                        <span className="cap">{item.name}</span>
                      </Link>
                    ) : (
                      <TypeArt
                        key={`${rep}-${i}`}
                        seed={`${item.t}${c}`}
                        title={item.t}
                        kicker={categoryLabel(item.cat)}
                        className="wall-item"
                      />
                    ),
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[0, 1].map((rep) =>
            [
              "Creators",
              "Fotografen",
              "Programmeurs",
              "Schilders",
              "Coaches",
              "Muzikanten",
              "Designers",
              "Installateurs",
              "Trainers",
              "Videomakers",
            ].map((w) => <span key={`${rep}-${w}`}>{w}</span>),
          )}
        </div>
      </div>

      <section className="section" aria-labelledby="ontdek-titel">
        <div className="container">
          <div className="section-head">
            <div>
              <p className="eyebrow">Ontdek</p>
              <h2 id="ontdek-titel">Werk dat je kunt zien. Diensten die je kunt boeken.</h2>
            </div>
            <Link href="/ontdek" className="btn secondary">
              Alles bekijken <Arrow />
            </Link>
          </div>
          {showcase.length > 0 ? (
            <div className="rail" role="list" aria-label="Nieuw op het platform">
              {showcase.map((item) => (
                <div role="listitem" key={`${item.type}-${item.id}`}>
                  {item.type === "service" ? (
                    <ServiceTile item={item} ctx={ctx} />
                  ) : item.type === "work" ? (
                    <WorkTile item={item} ctx={ctx} />
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid-3">
              {CATEGORIES.slice(0, 3).map((c) => (
                <div key={c.key} className="tile">
                  <TypeArt seed={c.key} title={c.examples[0]} kicker={c.label} style={{ aspectRatio: "4 / 3" }} />
                  <div className="tile-body">
                    <p className="small muted" style={{ margin: 0 }}>
                      Bijvoorbeeld. Hier verschijnen de eerste echte diensten zodra makers ze publiceren.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section" id="categorieen" aria-labelledby="cat-titel" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <div>
              <p className="eyebrow">Categorieën</p>
              <h2 id="cat-titel">Elk talent. Dezelfde kwaliteit.</h2>
              <p className="muted">Creators en traditionele zelfstandigen krijgen hier hetzelfde podium.</p>
            </div>
          </div>
          <div className="cat-grid">
            {CATEGORIES.map((c, i) => (
              <Link key={c.key} href={`/ontdek?categorie=${c.key}`} className="cat">
                <span className="n">
                  {String(i + 1).padStart(2, "0")}
                  {counts.get(c.key) ? ` · ${counts.get(c.key)} ${counts.get(c.key) === 1 ? "dienst" : "diensten"}` : ""}
                </span>
                <span>
                  <span className="name">{c.label}</span>
                  <span className="blurb">{c.blurb}</span>
                </span>
                <ArrowUpRight className="go" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section paper" aria-labelledby="makers-titel">
        <div className="container">
          <div className="section-head">
            <div>
              <p className="eyebrow">{spot.editorial ? "Uitgelicht door de redactie" : "Nieuw op Sell Yourself"}</p>
              <h2 id="makers-titel">Makers en hun aanbod</h2>
              <p className="muted small">
                {spot.editorial
                  ? "Gekozen door ons team. Uitlichten is nooit betaald."
                  : "De nieuwste makers met werk of een dienst online. Geen ranglijst, geen betaalde plekken."}
              </p>
            </div>
          </div>
          {spot.makers.length === 0 ? (
            <div className="empty">
              <h3>Hier staan straks de eerste makers.</h3>
              <p>Sell Yourself is net begonnen. We tonen hier alleen echte profielen, dus nog even niets.</p>
              <Link href={sellHref} className="btn dark">
                Word een van de eersten <Arrow />
              </Link>
            </div>
          ) : (
            <div className="grid-4">
              {spot.makers.map((m) => (
                <article key={m.user_id} className="tile" style={{ background: "#fff" }}>
                  <div className="media-frame" style={{ aspectRatio: "4 / 5" }}>
                    {m.cover_url ? (
                      <img src={m.cover_url} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <TypeArt
                        seed={m.username}
                        title={m.display_name}
                        kicker={categoryLabel(m.categories[0])}
                        style={{ height: "100%" }}
                      />
                    )}
                  </div>
                  <div className="tile-body stack-sm">
                    <div className="row tight">
                      <Avatar name={m.display_name} url={m.avatar_url} size={28} />
                      <h3 className="tile-title" style={{ margin: 0 }}>
                        <Link href={`/@${m.username}`}>{m.display_name}</Link>
                      </h3>
                    </div>
                    {m.headline && (
                      <p className="small muted" style={{ margin: 0 }}>
                        {m.headline}
                      </p>
                    )}
                    {m.services.length > 0 && (
                      <ul className="divided over" style={{ fontSize: "0.88rem" }}>
                        {m.services.map((s) => (
                          <li key={s.id} className="row between" style={{ padding: "8px 0" }}>
                            <Link href={`/diensten/${s.id}`} style={{ textDecoration: "none" }}>
                              {s.title}
                            </Link>
                            <PriceLabel kind={s.kind} price={s.price_cents} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section paper" id="zo-werkt-het" aria-labelledby="hoe-titel" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <div>
              <p className="eyebrow">Zo werkt het</p>
              <h2 id="hoe-titel">Boeken, overleggen, betalen. Helder vanaf de eerste klik.</h2>
            </div>
            <Link href="/hoe-het-werkt" className="btn secondary">
              Alles over kosten en zekerheid <Arrow />
            </Link>
          </div>
          <div className="steps">
            <div className="step">
              <h3>Ontdek en vergelijk</h3>
              <p>Bekijk portfolio&apos;s, diensten met vaste prijzen en reviews. Reviews kunnen alleen na een afgeronde opdracht.</p>
              <ul>
                <li>Zoek op talent, categorie of provincie</li>
                <li>Volg makers en bewaar wat je mooi vindt</li>
              </ul>
            </div>
            <div className="step">
              <h3>Boek direct of vraag maatwerk aan</h3>
              <p>
                <strong>Direct boeken</strong>: vaste prijs, vaste levertijd. <strong>Op aanvraag</strong>: je beschrijft je wens, stelt
                vragen in de chat en krijgt een offerte.
              </p>
              <ul>
                <li>Er is pas een afspraak als jij uitdrukkelijk bevestigt</li>
                <li>Contact loopt via berichten op het platform</li>
              </ul>
            </div>
            <div className="step">
              <h3>Betaal veilig, keur goed</h3>
              <p>Je betaalt via het platform. De maker krijgt het geld pas als jij de oplevering goedkeurt.</p>
              <ul>
                <li>Annuleren en klachten zijn geregeld, met terugbetaling</li>
                <li>{stripeMode() === "none" ? "Online betalen wordt geactiveerd vóór de lancering" : "iDEAL en creditcard via Stripe"}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="verkoop-titel">
        <div className="container split wide-side">
          <div>
            <p className="eyebrow">Verkoop jouw talent</p>
            <p className="big-statement" id="verkoop-titel">
              Eén profiel.
              <br />
              <span className="lime">Al je talent.</span>
            </p>
          </div>
          <div className="stack">
            <ul className="checklist">
              <li>Een eigen pagina op sellyourself.nl/@jouwnaam met je werk, foto&apos;s en video&apos;s</li>
              <li>Diensten met vaste prijzen én maatwerk via offertes</li>
              <li>Berichten, opdrachten en uitbetalingen op één plek</li>
              <li>Kopen en verkopen met hetzelfde account</li>
              <li>Geen abonnement: {feePercentLabel()} platformkosten, alleen over wat je verdient</li>
            </ul>
            <Link href={sellHref} className="btn large">
              Maak je profiel <Arrow />
            </Link>
          </div>
        </div>
      </section>

      <section className="section lime-band" aria-labelledby="cta-titel">
        <div className="container row between" style={{ alignItems: "flex-end", gap: 32 }}>
          <h2 id="cta-titel" className="big-statement" style={{ maxWidth: "12ch" }}>
            {HEADLINE.split(". ")[1]}
          </h2>
          <div className="stack" style={{ maxWidth: 380 }}>
            <p style={{ fontSize: "1.1rem", fontWeight: 500 }}>
              Maak gratis een account met alleen je e-mailadres. Binnen vijf minuten staat je profiel.
            </p>
            <div className="row">
              <Link href={v ? sellHref : "/inloggen"} className="btn dark large">
                Begin gratis <Arrow />
              </Link>
              <Link
                href="/ontdek"
                className="btn secondary large"
                style={{ "--btn-ink": "#101112", "--btn-line": "#101112" } as React.CSSProperties}
              >
                Eerst rondkijken
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
