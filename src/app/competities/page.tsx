import type { Metadata } from "next";
import Link from "next/link";
import { readContext } from "@/lib/data";
import { selectedCatalog } from "@/lib/football/catalog";
import { getCompetitions } from "@/lib/football/queries";
import { competitionPath } from "@/lib/slug";
import { formatDate } from "@/lib/time";
import { config } from "@/lib/env";

export const metadata: Metadata = {
  title: "Competities",
  description: "De voetbalcompetities op Voetbalradar, met per competitie het programma, de uitslagen en de stand.",
  alternates: { canonical: "/competities" },
};

const AVAILABILITY: Record<string, { label: string; cls: string }> = {
  available: { label: "Beschikbaar", cls: "badge-ok" },
  unavailable: { label: "Niet in huidig dataplan", cls: "badge-warn" },
  mismatch: { label: "Controle nodig", cls: "badge-error" },
  error: { label: "Fout bij controle", cls: "badge-error" },
  unknown: { label: "Nog niet gecontroleerd", cls: "" },
};

export default async function CompetitionsPage() {
  const read = await readContext();
  const list = read ? await getCompetitions(read) : [];
  const known = new Set(list.map((c) => c.slug));
  const pending = selectedCatalog(config().competitions).filter((c) => !known.has(c.slug));

  return (
    <div className="container page">
      <div className="page-head">
        <h1>Competities</h1>
        <p className="muted">We tonen een competitie pas als ondersteund wanneer de databron hem binnen ons abonnement daadwerkelijk levert.</p>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Competitie</th>
                <th scope="col">Land</th>
                <th scope="col">Seizoen</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const a = AVAILABILITY[c.availability] ?? AVAILABILITY.unknown;
                return (
                  <tr key={c.id}>
                    <td>{c.availability === "available" ? <Link href={competitionPath(c.slug)}>{c.name}</Link> : <span className="muted">{c.name}</span>}</td>
                    <td className="muted">{c.country}</td>
                    <td className="muted">{c.seasonName ?? "–"}</td>
                    <td>
                      <span className={`badge ${a.cls}`}>{a.label}</span>
                      {c.availabilityNote && <div className="tiny dim">{c.availabilityNote}</div>}
                      {c.checkedAt && <div className="tiny dim">Gecontroleerd {formatDate(c.checkedAt)}</div>}
                    </td>
                  </tr>
                );
              })}
              {pending.map((c) => (
                <tr key={c.slug}>
                  <td className="muted">{c.name}</td>
                  <td className="muted">{c.country}</td>
                  <td className="muted">–</td>
                  <td>
                    <span className="badge">{read ? "Nog niet gecontroleerd" : "Geen databron gekoppeld"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
