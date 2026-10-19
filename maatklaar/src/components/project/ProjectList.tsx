"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LIMITS } from "@/config/site";
import { formatDate } from "@/lib/format";
import { listProjects, purgeExpired, type ProjectSummary } from "@/lib/projects/store";

export function ProjectList() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    (async () => {
      await purgeExpired().catch(() => 0);
      setProjects(await listProjects().catch(() => []));
    })();
  }, []);

  return (
    <div className="container app-shell">
      <div className="app-head">
        <h1>Mijn projecten</h1>
        <Link href="/project/nieuw" className="btn btn-primary">
          Nieuw project
        </Link>
      </div>
      <p className="muted">
        Projecten staan alleen in deze browser op dit apparaat, niet op onze server. Na {LIMITS.projectExpiryDays} dagen zonder wijzigingen worden ze automatisch gewist.
      </p>
      {projects === null ? (
        <p className="muted" aria-busy="true">
          Laden…
        </p>
      ) : projects.length === 0 ? (
        <div className="panel stack-sm">
          <p style={{ margin: 0 }}>Je hebt hier nog geen projecten.</p>
          <Link href="/project/nieuw" className="btn btn-primary" style={{ justifySelf: "start" }}>
            Begin gratis met mijn woning
          </Link>
        </div>
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {projects.map((p) => (
            <li key={p.id} className="card-flat row" style={{ justifyContent: "space-between" }}>
              <div>
                <Link href={`/project/${p.id}`} style={{ fontWeight: 650, fontSize: "1.1rem" }}>
                  {p.name}
                </Link>
                <div className="small muted">
                  {p.address ? `${p.address} · ` : ""}laatst gewijzigd {formatDate(p.updatedAt)}
                </div>
              </div>
              {p.paid ? <span className="badge badge-brand">Volledig rapport</span> : <span className="badge badge-neutral">Gratis</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
