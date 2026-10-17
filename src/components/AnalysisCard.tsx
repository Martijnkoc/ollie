import type { AnalysisView } from "@/lib/ai/analyses";
import { formatDate, formatTime } from "@/lib/time";

const KIND: Record<string, string> = { fact: "Feit", statistic: "Statistiek", interpretation: "Interpretatie" };

/** AI analysis with its provenance. Outdated or missing analyses are said to be so, not hidden behind filler. */
export function AnalysisCard({ view, demo }: { view: AnalysisView; demo: boolean }) {
  const title = view.state !== "disabled" && view.kind === "preview" ? "AI-voorbeschouwing" : "AI-wedstrijdanalyse";
  return (
    <section className="card analysis" aria-labelledby="analysis-title">
      <div className="card-head">
        <h2 id="analysis-title">{title}</h2>
        <span className="badge">Gegenereerd met AI</span>
      </div>
      <div className="card-body stack-sm">
        {view.state === "disabled" && <p className="small muted">AI-analyses zijn nog niet geconfigureerd op deze site.</p>}
        {view.state === "none" && (
          <p className="small muted">
            {view.kind === null
              ? "Tijdens de wedstrijd maken we geen analyse. Na afloop volgt er een, zodra de definitieve gegevens binnen zijn."
              : "Er is nog geen analyse voor deze wedstrijd. Analyses worden vooraf gemaakt en alleen getoond als ze de controle doorstaan."}
          </p>
        )}
        {view.state === "outdated" && (
          <p className="small muted">
            Er zijn nieuwere gegevens dan waarop de vorige analyse was gebaseerd ({formatDate(view.createdAt)} {formatTime(view.createdAt)}
            ). Die tonen we daarom niet meer; een nieuwe volgt.
          </p>
        )}
        {view.state === "current" && (
          <>
            <h3 style={{ fontSize: "1.05rem" }}>{view.analysis.headline}</h3>
            <p>{view.analysis.summary}</p>
            {view.analysis.sections.map((s, i) => (
              <div key={i}>
                <h3 className="eyebrow" style={{ marginTop: 8 }}>
                  {s.title}
                </h3>
                {s.points.map((p, j) => (
                  <div className="point" key={j}>
                    <span className={`kind kind-${p.kind}`}>{KIND[p.kind]}</span>
                    <span>{p.text}</span>
                  </div>
                ))}
              </div>
            ))}
            {view.analysis.uncertainties.length > 0 && (
              <div>
                <h3 className="eyebrow" style={{ marginTop: 8 }}>
                  Onzekerheden
                </h3>
                <ul className="small muted" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {view.analysis.uncertainties.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
            {view.analysis.missing_data.length > 0 && (
              <p className="small dim">Ontbrekende gegevens: {view.analysis.missing_data.join("; ")}.</p>
            )}
            <p className="tiny dim">
              Gemaakt op {formatDate(view.createdAt)} om {formatTime(view.createdAt)} met gegevens tot {formatTime(view.dataAsOf)}
              {demo ? " (fictieve demo-gegevens)" : ""}. Automatisch gecontroleerd op getallen die niet in de gegevens staan. Interpretaties
              zijn geen zekerheden.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
