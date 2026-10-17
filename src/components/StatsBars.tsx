import { STAT_KEYS, STAT_LABELS, type StatKey } from "@/lib/football/model";
import type { StatView } from "@/lib/football/queries";

const fmt = (v: number | null, key: StatKey) => {
  if (v === null) return null;
  const unit = STAT_LABELS[key].unit ?? "";
  return key === "expected_goals" ? `${v.toFixed(2)}` : `${Math.round(v * 10) / 10}${unit}`;
};

/**
 * Only statistics the source actually sent are listed. A side without a value shows
 * "niet beschikbaar" and gets no bar; nothing is ever rendered as 0 by default.
 */
export function StatsBars({ stats }: { stats: StatView[] }) {
  const ordered = STAT_KEYS.flatMap((k) => stats.filter((s) => s.key === k));
  return (
    <ul className="stats">
      {ordered.map((s) => {
        const h = fmt(s.home, s.key);
        const a = fmt(s.away, s.key);
        const both = s.home !== null && s.away !== null;
        const total = both ? s.home! + s.away! : 0;
        const pct = (v: number | null) => (both && total > 0 && v !== null ? Math.round((v / total) * 100) : 0);
        return (
          <li key={s.key}>
            <div className="stat-head">
              <span className={h === null ? "na" : undefined}>{h ?? "n.b."}</span>
              <span>{STAT_LABELS[s.key].label}</span>
              <span className={a === null ? "na" : undefined}>{a ?? "n.b."}</span>
            </div>
            {both ? (
              <div className="stat-bars" aria-hidden="true">
                <div className={`stat-bar home${s.home! > s.away! ? " lead" : ""}`}>
                  <span style={{ width: `${pct(s.home)}%` }} />
                </div>
                <div className={`stat-bar${s.away! > s.home! ? " lead" : ""}`}>
                  <span style={{ width: `${pct(s.away)}%` }} />
                </div>
              </div>
            ) : (
              <p className="tiny dim">Niet beschikbaar voor beide teams bij de databron.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
