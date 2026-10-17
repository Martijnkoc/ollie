import type { Metadata } from "next";
import { FavoritesView } from "@/components/FavoritesView";

export const metadata: Metadata = {
  title: "Favorieten",
  description: "Wedstrijden van de clubs en competities die je volgt.",
  alternates: { canonical: "/favorieten" },
  robots: { index: false, follow: true },
};

export default function FavoritesPage() {
  return (
    <div className="container page" style={{ maxWidth: 960 }}>
      <div className="page-head">
        <h1>Favorieten</h1>
        <p className="muted small">Bewaard in deze browser, zonder account. Wis je browsergegevens, dan ben je ze kwijt.</p>
      </div>
      <FavoritesView />
    </div>
  );
}
