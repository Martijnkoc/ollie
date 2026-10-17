import { jsonLdString } from "@/lib/seo";

/** Structured data, only rendered for content that is visible on the same page. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
