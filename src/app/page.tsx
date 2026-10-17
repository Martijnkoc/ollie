import type { Metadata } from "next";
import { DayView } from "@/components/DayView";
import { JsonLd } from "@/components/JsonLd";
import { readContext } from "@/lib/data";
import { config } from "@/lib/env";
import { absoluteUrl, isIndexable } from "@/lib/seo";
import { localDay } from "@/lib/time";

export const metadata: Metadata = {
  title: { absolute: "Voetbalradar · Livescores en wedstrijden van vandaag" },
  description:
    "Alle wedstrijden van vandaag: live scores, uitslagen en het programma van de Eredivisie, Europese topcompetities, Champions League en Europa League.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const read = await readContext();
  const today = localDay(new Date());
  const cfg = config();
  return (
    <>
      {isIndexable(cfg) && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Voetbalradar",
            url: absoluteUrl(cfg, "/"),
            inLanguage: "nl-NL",
          }}
        />
      )}
      <DayView read={read} day={today} today={today} />
    </>
  );
}
