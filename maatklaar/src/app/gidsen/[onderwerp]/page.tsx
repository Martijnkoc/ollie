import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/brand/Icon";
import { GuideBlocks } from "@/components/seo/GuideBody";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMetadata } from "@/components/seo/metadata";
import { BRAND, PRICE, siteUrl } from "@/config/site";
import { GUIDE_INDEX } from "@/content/guide-index";
import { GUIDES, guideBySlug } from "@/content/guides";
import { formatDate } from "@/lib/format";

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ onderwerp: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/gidsen/[onderwerp]">): Promise<Metadata> {
  const { onderwerp } = await params;
  const g = guideBySlug(onderwerp);
  if (!g) return {};
  return pageMetadata({ title: g.metaTitle, description: g.description, path: `/gidsen/${g.slug}`, type: "article" });
}

export default async function GuidePage({ params }: PageProps<"/gidsen/[onderwerp]">) {
  const { onderwerp } = await params;
  const g = guideBySlug(onderwerp);
  if (!g) notFound();
  const url = siteUrl();
  const nav = (slug: string) => GUIDE_INDEX.find((x) => x.slug === slug)!.nav;
  return (
    <article className="container guide">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: g.title,
            description: g.description,
            inLanguage: BRAND.language,
            dateModified: g.updated,
            mainEntityOfPage: `${url}/gidsen/${g.slug}`,
            author: { "@id": `${url}/#organisatie` },
            publisher: { "@id": `${url}/#organisatie` },
            citation: g.sources.filter((s) => s.url.startsWith("http")).map((s) => s.url),
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: BRAND.name, item: url },
              { "@type": "ListItem", position: 2, name: "Gidsen", item: `${url}/gidsen` },
              { "@type": "ListItem", position: 3, name: g.title, item: `${url}/gidsen/${g.slug}` },
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          },
        ]}
      />
      <nav aria-label="Kruimelpad" className="crumbs small">
        <Link href="/">{BRAND.name}</Link> <span aria-hidden="true">/</span> <Link href="/gidsen">Gidsen</Link>{" "}
        <span aria-hidden="true">/</span> <span aria-current="page">{nav(g.slug)}</span>
      </nav>
      <header className="guide-head">
        <p className="eyebrow">Gids</p>
        <h1>{g.title}</h1>
        <p className="tiny muted">Bijgewerkt op {formatDate(g.updated)}</p>
      </header>
      <div className="guide-layout">
        <div className="guide-main">
          <section className="answer framed" aria-labelledby="kort-antwoord">
            <h2 id="kort-antwoord">Kort antwoord</h2>
            <p>{g.answer}</p>
          </section>
          {g.sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              <GuideBlocks blocks={s.blocks} />
            </section>
          ))}
          <section>
            <h2>Veelgestelde vragen</h2>
            <div className="faq">
              {g.faq.map((f) => (
                <details key={f.q} open>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </section>
          <section>
            <h2>Bronnen</h2>
            <ul className="sources small">
              {g.sources.map((s) => (
                <li key={s.url}>
                  {s.url.startsWith("http") ? (
                    <a href={s.url} rel="noopener">
                      {s.label}
                    </a>
                  ) : (
                    <Link href={s.url}>{s.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside className="guide-aside stack">
          <div className="card stack-sm">
            <strong>Liever niet zelf rekenen?</strong>
            <p className="small" style={{ margin: 0 }}>
              {g.inApp}
            </p>
            <Link href="/project/nieuw" className="btn btn-primary">
              Breng mijn woning in kaart
            </Link>
            <span className="tiny muted">
              Start gratis · Complete bestellijst {PRICE.label} {PRICE.period}
            </span>
          </div>
          <nav aria-label="Verwante gidsen" className="stack-sm">
            <strong className="small">Verder lezen</strong>
            {g.related.map((r) => (
              <Link key={r} href={`/gidsen/${r}`} className="guide-link">
                {nav(r)}
                <Icon name="arrow-right" />
              </Link>
            ))}
          </nav>
        </aside>
      </div>
    </article>
  );
}
