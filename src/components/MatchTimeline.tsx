import type { MatchEventView } from "@/lib/football/queries";

const ICON: Record<string, { cls: string; text: string; label: string }> = {
  goal: { cls: "ev-goal", text: "⚽", label: "Doelpunt" },
  penalty_goal: { cls: "ev-goal", text: "⚽", label: "Doelpunt uit strafschop" },
  own_goal: { cls: "ev-goal", text: "⚽", label: "Eigen doelpunt" },
  missed_penalty: { cls: "ev-miss", text: "✕", label: "Gemiste strafschop" },
  yellow_card: { cls: "ev-card-y", text: "", label: "Gele kaart" },
  second_yellow: { cls: "ev-card-yr", text: "", label: "Tweede gele kaart" },
  red_card: { cls: "ev-card-r", text: "", label: "Rode kaart" },
  substitution: { cls: "ev-sub-icon", text: "⇄", label: "Wissel" },
  var: { cls: "ev-var", text: "VAR", label: "VAR" },
  shootout_goal: { cls: "ev-goal", text: "●", label: "Benutte strafschop (serie)" },
  shootout_miss: { cls: "ev-miss", text: "○", label: "Gemiste strafschop (serie)" },
};

function minute(e: MatchEventView) {
  if (e.minute === null) return "–";
  return e.minuteExtra ? `${e.minute}+${e.minuteExtra}'` : `${e.minute}'`;
}

/**
 * For goals the side that benefits is derived from the running score when the source gives it,
 * so an own goal appears with the team it counted for.
 */
function sides(events: MatchEventView[]) {
  let prev: [number, number] = [0, 0];
  return events.map((e) => {
    if (e.scoreAfter && /^\d+-\d+$/.test(e.scoreAfter) && (e.type === "goal" || e.type === "own_goal" || e.type === "penalty_goal")) {
      const [h, a] = e.scoreAfter.split("-").map(Number);
      const side = h > prev[0] ? "home" : a > prev[1] ? "away" : e.side;
      prev = [h, a];
      return side;
    }
    return e.side;
  });
}

function Describe({ e }: { e: MatchEventView }) {
  const icon = ICON[e.type] ?? { cls: "", text: "•", label: e.type };
  let main = e.playerName ?? icon.label;
  let sub: string | null = null;
  if (e.type === "substitution") {
    main = e.playerName ? `In: ${e.playerName}` : "Wissel";
    sub = e.relatedName ? `Uit: ${e.relatedName}` : null;
  } else if (e.type === "goal" || e.type === "penalty_goal" || e.type === "own_goal") {
    const suffix = e.type === "own_goal" ? " (e.d.)" : e.type === "penalty_goal" ? " (pen.)" : "";
    main = `${e.playerName ?? "Doelpunt"}${suffix}`;
    sub = [e.scoreAfter, e.relatedName ? `assist ${e.relatedName}` : null].filter(Boolean).join(" · ") || null;
  } else if (e.type === "var") {
    sub = e.detail;
  } else if (e.type === "missed_penalty") {
    sub = "strafschop gemist";
  }
  return (
    <>
      <span className={`ev-icon ${icon.cls}`} role="img" aria-label={icon.label}>
        {icon.text}
      </span>
      <span className="ev-text">
        <span>{main}</span>
        {sub && <span className="ev-sub">{sub}</span>}
      </span>
    </>
  );
}

export function MatchTimeline({ events, homeName, awayName }: { events: MatchEventView[]; homeName: string; awayName: string }) {
  const side = sides(events);
  return (
    <ol className="timeline" aria-label={`Gebeurtenissen: ${homeName} links, ${awayName} rechts`}>
      {events.map((e, i) => {
        const showBreak = i > 0 && (events[i - 1].minute ?? 0) <= 45 && (e.minute ?? 0) > 45 && !(events[i - 1].minute === 45 && events[i - 1].minuteExtra);
        return [
          showBreak ? (
            <li key={`b${i}`} style={{ display: "block", padding: 0 }}>
              <span className="divider">Rust</span>
            </li>
          ) : null,
          <li key={i}>
            <span className="ev ev-home">{side[i] === "home" ? <Describe e={e} /> : null}</span>
            <span className="minute">{minute(e)}</span>
            <span className="ev">{side[i] === "away" ? <Describe e={e} /> : side[i] === null ? <Describe e={e} /> : null}</span>
          </li>,
        ];
      })}
    </ol>
  );
}
