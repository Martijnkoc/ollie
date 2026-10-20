import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/brand/Icon";
import { JsonLd } from "@/components/seo/JsonLd";
import { BRAND, siteUrl } from "@/config/site";
import { GUIDE_GROUPS, GUIDE_INDEX } from "@/content/guide-index";
import { guideBySlug } from "@/content/guides";

export const metadata: Metadata = {
  title: "Gidsen: vloer, verf, plinten en raamdecoratie berekenen",
  description:
    "Praktische gidsen met formules en rekenvoorbeelden: vloeroppervlakte, laminaat, ondervloer, tegels, plinten, verf en het meten van gordijnen, jaloezieën, plissés en rolluiken.",
  alternates: { canonical: "/gidsen" },
};

export default function GuidesPage() {
  const url = siteUrl();
  return (
    <div className="container guide">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `Gidsen van ${BRAND.name}`,
          itemListElement: GUIDE_INDEX.map((g, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${url}/gidsen/${g.slug}`,
            name: g.nav,
          })),
        }}
      />
      <header className="guide-head">
        <p className="eyebrow">Gidsen</p>
        <h1>Zelf uitrekenen hoe het zit</h1>
        <p className="hero-lead">
          Hoe je meet en rekent voor vloer, verf, plinten en raamdecoratie. Met de formules die we zelf gebruiken, rekenvoorbeelden en
          bronnen. Waar een leverancier eigen regels heeft, zeggen we dat erbij.
        </p>
      </header>
      {(Object.keys(GUIDE_GROUPS) as (keyof typeof GUIDE_GROUPS)[]).map((group) => (
        <section key={group} className="section-tight">
          <h2>{GUIDE_GROUPS[group]}</h2>
          <div className="guide-grid">
            {GUIDE_INDEX.filter((g) => g.group === group).map((g) => (
              <Link key={g.slug} href={`/gidsen/${g.slug}`} className="guide-link">
                {g.nav}
                <Icon name="arrow-right" />
                <span>{guideBySlug(g.slug)!.description}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
