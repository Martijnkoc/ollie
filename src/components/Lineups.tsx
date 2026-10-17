import type { LineupView } from "@/lib/football/queries";

const POS: Record<string, string> = { K: "Keeper", V: "Verdediger", M: "Middenvelder", A: "Aanvaller" };

function Column({ title, lineup }: { title: string; lineup: LineupView | null }) {
  return (
    <div className="lineup">
      <h3>
        {title}
        {lineup?.formation && <span className="dim small"> · {lineup.formation}</span>}
      </h3>
      {!lineup ? (
        <p className="small dim">Opstelling niet beschikbaar.</p>
      ) : (
        <>
          <ol aria-label={`Basisopstelling ${title}`}>
            {lineup.starters.map((p, i) => (
              <li key={i}>
                <span className="shirt">{p.number ?? ""}</span>
                <span>{p.name}</span>
                {p.position && (
                  <span className="pos" title={POS[p.position]}>
                    {p.position}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {lineup.substitutes.length > 0 && (
            <>
              <p className="tiny dim" style={{ marginTop: 10 }}>
                Wisselspelers
              </p>
              <ol aria-label={`Wisselspelers ${title}`}>
                {lineup.substitutes.map((p, i) => (
                  <li key={i} className="muted">
                    <span className="shirt">{p.number ?? ""}</span>
                    <span>{p.name}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {lineup.coachName && (
            <p className="tiny dim" style={{ marginTop: 10 }}>
              Trainer: {lineup.coachName}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function Lineups({
  home,
  away,
  homeName,
  awayName,
}: {
  home: LineupView | null;
  away: LineupView | null;
  homeName: string;
  awayName: string;
}) {
  return (
    <div className="lineups">
      <Column title={homeName} lineup={home} />
      <Column title={awayName} lineup={away} />
    </div>
  );
}
